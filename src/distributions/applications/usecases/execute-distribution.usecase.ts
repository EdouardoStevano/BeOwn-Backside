import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PeriodeDistribution } from '../../domains/periode-distribution';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import {
  PERIODE_DISTRIBUTION_REPOSITORY,
  type PeriodeDistributionRepository,
} from '../ports/repositories/periode-distribution.repository';
import {
  DISTRIBUTION_PART_REPOSITORY,
  type DistributionPartRepository,
} from '../ports/repositories/distribution-part.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from 'src/investments/applications/ports/repositories/investment.repository';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AmlMonitorService } from 'src/common/aml/aml-monitor.service';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from 'src/projects/applications/ports/repositories/project.repository';
import { TransactionalEmailNotifier } from 'src/shared/email/transactional-email.notifier';
import { formatEur } from 'src/shared/money/format-eur';
import { ResolveProjectWalletUseCase } from 'src/wallets/applications/usecases/resolve-project-wallet.usecase';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Versement individuel effectivement payé, retenu pour être annoncé APRÈS le
 * commit. Rien n'est notifié depuis l'intérieur de la transaction : un
 * rollback ultérieur laisserait l'investisseur avec l'annonce d'un versement
 * qui n'a jamais eu lieu.
 */
interface VersementPaye {
  utilisateurId: number;
  partId: string;
  montantNet: number;
}

export interface ExecuteDistributionResult {
  periode: PeriodeDistribution;
  nbPartsPayees: number;
  nbPartsSkipped: number;
  totalNetVerse: number;
  totalIR: number;
  totalCSG: number;
}

/**
 * Exécute le versement d'une période de distribution validée :
 *
 * - Encaisse les DEUX frais plateforme calculés (et persistés) sur la
 *   période — `fraisPlateformeAnnuel` / `fraisGestionLocative` — via un
 *   crédit wallet FRAIS_PLATEFORME + une transaction ledger par frais
 *   (metadata.source). C'est ICI, et seulement ici, que ces frais bougent de
 *   l'argent : le calcul ne fait que projeter les montants (voir
 *   CalculateDistributionPeriodeUseCase), ce qui garde l'annulation d'une
 *   période CALCULEE/VALIDEE totalement gratuite.
 * - Pour chaque DistributionPart :
 *   - Si montantNet > 0 → crédit wallet INVESTISSEUR
 *   - Si prelevementIR > 0 → crédit wallet SEQUESTRE_IR
 *   - Si prelevementCSG > 0 → crédit wallet SEQUESTRE_CSG
 *   - 1 à 3 transactions ledger avec idempotency keys
 *   - Marque payeLe sur la part
 * - Si montantNet ≤ 0 (mois déficitaire) → skip la part (pas de crédit, pas de débit)
 *   La part reste en place mais payeLe reste null (à revoir Phase 9 si on veut
 *   du "claw-back" sur les futures distributions).
 * - Statut période → DISTRIBUEE + distribueeLe
 *
 * Idempotency : si une période est déjà DISTRIBUEE, throw 400.
 * Les transactions ledger sont marquées par `idempotencyKey` unique par part.
 */
@Injectable()
export class ExecuteDistributionUseCase {
  private readonly logger = new Logger(ExecuteDistributionUseCase.name);

  constructor(
    @Inject(PERIODE_DISTRIBUTION_REPOSITORY)
    private readonly periodeRepo: PeriodeDistributionRepository,
    @Inject(DISTRIBUTION_PART_REPOSITORY)
    private readonly partRepo: DistributionPartRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepo: InvestmentRepository,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
    private readonly amlMonitor: AmlMonitorService,
    private readonly metrics: MetricsPort,
    private readonly notificationService: NotificationService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: ProjectRepository,
    private readonly transactionalEmails: TransactionalEmailNotifier,
    /**
     * Contrepartie DÉBITRICE de la distribution. Le portefeuille technique du
     * projet est la seule origine légitime de ce qui est versé : il est
     * alimenté par le porteur (`APPORT_PORTEUR`) et se vide quand la période
     * est servie.
     */
    private readonly projectWalletResolver: ResolveProjectWalletUseCase,
  ) {}

  /**
   * Crédit ATOMIQUE d'un portefeuille : l'incrément est calculé PAR LA BASE
   * (`UPDATE wallet SET solde = solde + :montant`), jamais par le processus.
   *
   * Le schéma « lire le solde, ajouter en mémoire, réécrire la ligne » perd
   * silencieusement toute écriture concurrente survenue entre la lecture et
   * l'écriture — typiquement un retrait de l'investisseur qui s'intercale
   * pendant l'exécution d'une distribution : le retrait est débité, puis
   * écrasé par un solde reconstruit à partir d'une valeur périmée. Les euros
   * retirés réapparaissent sur le portefeuille. Même pattern que
   * `RequestRetraitUseCase.openRetraitTransaction`.
   */
  private async crediterWallet(
    em: EntityManager,
    walletId: string,
    montant: number,
  ): Promise<void> {
    await em
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => 'solde + :montant' })
      .setParameter('montant', montant)
      .where('id = :id', { id: walletId })
      .execute();
  }

  /**
   * DÉBIT du portefeuille technique du projet — la contrepartie de tout ce que
   * la distribution verse.
   *
   * Sans ce débit, chaque crédit ci-dessous fabriquait des euros : le registre
   * restait rapproché portefeuille par portefeuille (les écritures suivaient
   * les soldes), mais la plateforme devait à ses clients plus qu'elle ne
   * détenait — un écart qui n'apparaissait qu'au rapprochement PSP du
   * lendemain, sans qu'aucune ligne ne dise d'où il venait.
   *
   * INCONDITIONNEL, exactement comme le règlement d'échéance et le
   * remboursement de collecte : la distribution est due aux investisseurs, et
   * un projet mal alimenté est un problème de porteur, pas un impayé
   * d'investisseur. Le découvert n'est pas masqué pour autant — il est
   * journalisé et remonté en jauge dès l'exécution.
   */
  private async debiterProjet(
    em: EntityManager,
    walletProjetId: string,
    montant: number,
  ): Promise<void> {
    if (!montant) return;
    await em
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => 'solde - :montant' })
      .setParameter('montant', montant)
      .where('id = :id', { id: walletProjetId })
      .execute();
  }

  async execute(
    periodeId: string,
    adminUserId?: number,
    adminRole?: string,
  ): Promise<ExecuteDistributionResult> {
    const periode = await this.periodeRepo.findById(periodeId);
    if (!periode) {
      throw new NotFoundException('Période de distribution introuvable.');
    }
    if (periode.statut !== StatutPeriodeDistribution.VALIDEE) {
      throw new BadRequestException(
        `Statut actuel "${periode.statut}" — seul VALIDEE peut être exécuté.`,
      );
    }

    const parts = await this.partRepo.findByPeriode(periodeId);
    if (parts.length === 0) {
      this.logger.warn(`Aucune part à distribuer pour periode ${periodeId}.`);
    }

    let nbPartsPayees = 0;
    let nbPartsSkipped = 0;
    let totalNetVerse = 0;
    let totalIR = 0;
    let totalCSG = 0;
    const versements: VersementPaye[] = [];

    await this.dataSource.transaction(async (em) => {
      // ── Contrepartie DÉBITRICE de toute la période ────────────────────────
      // Résolue une seule fois, SOUS le verrou de la ligne projet : c'est le
      // point de rendez-vous de toutes les écritures financières d'un projet.
      // Tout ce que la période verse — frais de plateforme, net investisseur,
      // retenues fiscales — sort de ce portefeuille et de nulle part ailleurs.
      const walletProjet = await this.projectWalletResolver.executeInTransaction(
        em,
        periode.projetId,
      );
      // Solde suivi HORS entité : les débits passent par un UPDATE SQL
      // atomique, l'entité chargée n'est jamais réécrite. Muter son champ
      // ferait croire à une seconde source de vérité ; on ne garde qu'un
      // compteur local, pour la seule détection de découvert (même discipline
      // que `refund-collecte.service.ts`).
      let soldeProjetSuivi = Number(walletProjet.solde);

      // ── Encaissement des frais plateforme — SEULEMENT à l'exécution ──────
      // Les montants ont été figés au calcul (snapshot de taux R1) et sont
      // simplement rejoués ici : aucune dérive possible, et une période ne
      // peut être exécutée qu'une seule fois (VALIDEE → DISTRIBUEE), ce qui
      // garantit l'idempotence des clés `distribution:fee:<source>:<id>`.
      const fraisPlateformeAnnuel = round2(
        Number(periode.fraisPlateformeAnnuel ?? 0),
      );
      const fraisGestionLocative = round2(
        Number(periode.fraisGestionLocative ?? 0),
      );
      if (fraisPlateformeAnnuel > 0 || fraisGestionLocative > 0) {
        let walletPlat = await em.findOne(WalletEntity, {
          where: { type: WalletType.FRAIS_PLATEFORME },
        });
        if (!walletPlat) {
          walletPlat = await em.save(
            WalletEntity,
            em.create(WalletEntity, {
              type: WalletType.FRAIS_PLATEFORME,
              proprietaireUserId: null,
              fournisseurRef: 'PLAT-FEES-001',
              devise: 'EUR',
              solde: 0,
            }),
          );
        }
        const totalFrais = round2(
          fraisPlateformeAnnuel + fraisGestionLocative,
        );
        // Les frais sont PRÉLEVÉS sur les revenus du projet : ils sortent de
        // son portefeuille avant d'entrer dans celui de la plateforme.
        await this.debiterProjet(em, walletProjet.id, totalFrais);
        soldeProjetSuivi -= totalFrais;
        await this.crediterWallet(em, walletPlat.id, totalFrais);

        if (fraisPlateformeAnnuel > 0) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              walletSource: walletProjet.id,
              walletDestination: walletPlat.id,
              type: TransactionType.FRAIS,
              montant: fraisPlateformeAnnuel,
              devise: walletPlat.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              projetId: periode.projetId,
              idempotencyKey: `distribution:fee:plateforme_annuel:${periode.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
              metadata: {
                source: 'plateforme_annuel',
                periodeDistributionId: periode.id,
                periode: periode.periode,
                capped: periode.fraisPlafonnes,
              },
            }),
          );
        }
        if (fraisGestionLocative > 0) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              walletSource: walletProjet.id,
              walletDestination: walletPlat.id,
              type: TransactionType.FRAIS,
              montant: fraisGestionLocative,
              devise: walletPlat.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              projetId: periode.projetId,
              idempotencyKey: `distribution:fee:gestion_locative:${periode.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
              metadata: {
                source: 'gestion_locative',
                periodeDistributionId: periode.id,
                periode: periode.periode,
                totalLoyers: periode.totalLoyers,
                capped: periode.fraisPlafonnes,
              },
            }),
          );
        }
      }

      // Wallets système (lazy create, parité avec pay-echeance.usecase)
      let walletIR: WalletEntity | null = null;
      let walletCSG: WalletEntity | null = null;

      for (const part of parts) {
        // Skip parts déficitaires (revenuNet négatif)
        if (part.montantNet <= 0) {
          nbPartsSkipped++;
          continue;
        }

        // Trouver l'investissement pour récupérer l'utilisateurId
        const inv = await this.investmentRepo.findInvestmentById(
          part.investissementId,
        );
        if (!inv) {
          this.logger.warn(
            `Investissement ${part.investissementId} introuvable — part ignorée.`,
          );
          nbPartsSkipped++;
          continue;
        }

        // Wallet investisseur
        const wallet = await em.findOne(WalletEntity, {
          where: {
            proprietaireUserId: inv.utilisateurId,
            type: WalletType.INVESTISSEUR,
          },
        });
        if (!wallet) {
          this.logger.warn(
            `Wallet investisseur user=${inv.utilisateurId} introuvable — part ignorée.`,
          );
          nbPartsSkipped++;
          continue;
        }

        // DÉBIT du projet pour le BRUT de cette part : le net qui revient à
        // l'investisseur ET les retenues fiscales, qui sortent de la même
        // poche pour être consignées ailleurs.
        const brutPart = round2(
          part.montantNet +
            Math.max(0, part.prelevementIR) +
            Math.max(0, part.prelevementCSG),
        );
        await this.debiterProjet(em, walletProjet.id, brutPart);
        soldeProjetSuivi -= brutPart;

        // Crédit wallet investisseur — atomique (voir crediterWallet).
        await this.crediterWallet(em, wallet.id, part.montantNet);

        // Crédit séquestre IR
        if (part.prelevementIR > 0) {
          if (!walletIR) {
            walletIR = await em.findOne(WalletEntity, {
              where: { type: WalletType.SEQUESTRE_IR },
            });
            if (!walletIR) {
              walletIR = await em.save(
                WalletEntity,
                em.create(WalletEntity, {
                  type: WalletType.SEQUESTRE_IR,
                  proprietaireUserId: null,
                  fournisseurRef: 'SEQUESTRE-IR',
                  devise: wallet.devise,
                  solde: 0,
                }),
              );
            }
          }
          await this.crediterWallet(em, walletIR.id, part.prelevementIR);
        }

        // Crédit séquestre CSG
        if (part.prelevementCSG > 0) {
          if (!walletCSG) {
            walletCSG = await em.findOne(WalletEntity, {
              where: { type: WalletType.SEQUESTRE_CSG },
            });
            if (!walletCSG) {
              walletCSG = await em.save(
                WalletEntity,
                em.create(WalletEntity, {
                  type: WalletType.SEQUESTRE_CSG,
                  proprietaireUserId: null,
                  fournisseurRef: 'SEQUESTRE-CSG',
                  devise: wallet.devise,
                  solde: 0,
                }),
              );
            }
          }
          await this.crediterWallet(em, walletCSG.id, part.prelevementCSG);
        }

        // Ledger : crédit principal
        await em.save(
          TransactionEntity,
          em.create(TransactionEntity, {
            walletSource: walletProjet.id,
            walletDestination: wallet.id,
            type: TransactionType.PAIEMENT_INTERETS,
            montant: part.montantNet,
            devise: wallet.devise,
            statut: TransactionStatus.REUSSI,
            fournisseur: TransactionFournisseur.INTERNE,
            investissementId: inv.id,
            projetId: periode.projetId,
            idempotencyKey: `distribution:net:${part.id}`,
            fraisPsp: 0,
            fraisPlateforme: 0,
          }),
        );

        // Ledger : IR
        if (part.prelevementIR > 0 && walletIR) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              walletSource: walletProjet.id,
              walletDestination: walletIR.id,
              type: TransactionType.IMPOTS,
              montant: part.prelevementIR,
              devise: wallet.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              investissementId: inv.id,
              projetId: periode.projetId,
              idempotencyKey: `distribution:ir:${part.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
            }),
          );
        }

        // Ledger : CSG
        if (part.prelevementCSG > 0 && walletCSG) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              walletSource: walletProjet.id,
              walletDestination: walletCSG.id,
              type: TransactionType.IMPOTS,
              montant: part.prelevementCSG,
              devise: wallet.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              investissementId: inv.id,
              projetId: periode.projetId,
              idempotencyKey: `distribution:csg:${part.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
            }),
          );
        }

        // Marquer la part payée
        await this.partRepo.markPaid(part.id, new Date());

        // AML check sur ce versement individuel
        await this.amlMonitor
          .check({
            userId: inv.utilisateurId,
            amount: part.montantNet,
            context: 'distribution',
            reference: part.id,
          })
          .catch(() => {});

        nbPartsPayees++;
        totalNetVerse += part.montantNet;
        totalIR += part.prelevementIR;
        totalCSG += part.prelevementCSG;
        versements.push({
          utilisateurId: inv.utilisateurId,
          partId: part.id,
          montantNet: part.montantNet,
        });
      }

      // ── Découvert du projet : dit, jamais masqué ──────────────────────────
      // Si le projet n'était pas assez alimenté, la distribution a QUAND MÊME
      // eu lieu — elle est due — et le trou devient visible immédiatement,
      // sans attendre le rapprochement du lendemain. Le corriger ici serait
      // pire que de le signaler : ce serait fabriquer les euros qui manquent.
      if (soldeProjetSuivi < 0) {
        this.logger.warn(
          `Portefeuille projet ${walletProjet.id} en découvert de ` +
          `${formatEur(Math.abs(soldeProjetSuivi))} après la distribution ${periode.id} ` +
          `(projet ${periode.projetId}). Le projet doit être alimenté par son porteur.`,
        );
        this.metrics.setGauge(
          METRIC.PROJECT_WALLET_SHORTFALL_EUR,
          Math.abs(soldeProjetSuivi),
        );
      }

      // Marquer la période DISTRIBUEE
      periode.statut = StatutPeriodeDistribution.DISTRIBUEE;
      periode.distribueeLe = new Date();
      await this.periodeRepo.save(periode);
    });

    const result: ExecuteDistributionResult = {
      periode,
      nbPartsPayees,
      nbPartsSkipped,
      totalNetVerse: Math.round(totalNetVerse * 100) / 100,
      totalIR: Math.round(totalIR * 100) / 100,
      totalCSG: Math.round(totalCSG * 100) / 100,
    };
    this.logger.log(
      `Distribution exécutée : période=${periodeId} payées=${nbPartsPayees} skipped=${nbPartsSkipped} net=${result.totalNetVerse}`,
    );

    if (nbPartsPayees > 0) {
      this.metrics.incrementCounter(
        METRIC.DISTRIBUTION_PARTS_TOTAL,
        { outcome: 'paid' },
        nbPartsPayees,
      );
    }
    if (nbPartsSkipped > 0) {
      this.metrics.incrementCounter(
        METRIC.DISTRIBUTION_PARTS_TOTAL,
        { outcome: 'skipped' },
        nbPartsSkipped,
      );
    }
    if (result.totalNetVerse > 0) {
      this.metrics.observeHistogram(METRIC.DISTRIBUTION_AMOUNT_EUR, result.totalNetVerse, {
        component: 'net',
      });
    }
    if (result.totalIR > 0) {
      this.metrics.observeHistogram(METRIC.DISTRIBUTION_AMOUNT_EUR, result.totalIR, {
        component: 'ir',
      });
    }
    if (result.totalCSG > 0) {
      this.metrics.observeHistogram(METRIC.DISTRIBUTION_AMOUNT_EUR, result.totalCSG, {
        component: 'csg',
      });
    }

    // Annonce APRÈS COMMIT — un versement encaissé mais jamais annoncé est
    // une distribution silencieuse : l'investisseur ne peut pas rapprocher son
    // solde d'un événement.
    await this.annoncerVersements(periode, versements);

    // Audit log — Phase 10 (traçabilité réglementaire pour mouvements de fonds)
    if (adminUserId != null) {
      await this.auditLog
        .create(
          String(adminUserId),
          adminRole ?? UserRole.SUPER_ADMIN,
          'equity.distribution.execute',
          'periode_distribution',
          periodeId,
          undefined,
          undefined,
          {
            projetId: periode.projetId,
            periode: periode.periode,
            nbPartsPayees,
            nbPartsSkipped,
            totalNetVerse: result.totalNetVerse,
            totalIR: result.totalIR,
            totalCSG: result.totalCSG,
          },
        )
        .catch(() => {
          // L'audit échoue silencieusement — on ne veut pas annuler une
          // distribution réussie pour un échec d'audit.
        });
    }

    return result;
  }

  /**
   * Notifie chaque bénéficiaire du versement qui vient d'être crédité :
   * notification in-app (toujours) et e-mail transactionnel (si l'utilisateur
   * n'a pas coupé le canal e-mail — arbitré par TransactionalEmailNotifier).
   *
   * Appelée APRÈS le commit, jamais depuis l'intérieur de la transaction :
   * annoncer un versement qu'un rollback effacerait ensuite serait pire que
   * de ne rien annoncer. Chaque envoi est isolé — l'échec d'une notification
   * ne doit priver ni les suivantes ni l'appelant d'une distribution qui, elle,
   * est bel et bien enregistrée.
   *
   * Le titre du projet est relu UNE fois pour toute la période (pas de N+1 :
   * une période porte un seul projet).
   */
  private async annoncerVersements(
    periode: PeriodeDistribution,
    versements: VersementPaye[],
  ): Promise<void> {
    if (versements.length === 0) return;

    let projetTitre = 'votre projet';
    try {
      const projet = await this.projectRepo.findProjectById(periode.projetId);
      if (projet?.titre) projetTitre = projet.titre;
    } catch (err: any) {
      this.logger.warn(
        `Titre du projet ${periode.projetId} illisible — libellé générique utilisé : ${err?.message}`,
      );
    }

    for (const versement of versements) {
      await this.notificationService
        .push({
          utilisateurId: versement.utilisateurId,
          // Aucun type « distribution » n'existe dans NotificationType :
          // ECHEANCE est le type des versements périodiques reçus par un
          // investisseur, ce qu'est exactement une distribution locative.
          type: NotificationType.ECHEANCE,
          titre: 'Revenus locatifs versés',
          message:
            `${formatEur(versement.montantNet)} nets vous ont été versés pour ` +
            `« ${projetTitre} » au titre de la période ${periode.periode}.`,
          metadata: {
            projetId: periode.projetId,
            periodeDistributionId: periode.id,
            periode: periode.periode,
            distributionPartId: versement.partId,
            montantNet: versement.montantNet,
          },
        })
        .catch(() => {
          // Notification non bloquante : l'argent est déjà crédité.
        });

      await this.transactionalEmails.distributionRecue(
        versement.utilisateurId,
        {
          montant: versement.montantNet,
          projetTitre,
          periode: periode.periode,
        },
      );
    }
  }
}
