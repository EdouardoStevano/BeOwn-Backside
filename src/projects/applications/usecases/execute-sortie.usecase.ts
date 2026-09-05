import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SortieProjet, StatutSortie } from '../../domains/sortie-projet';
import {
  SORTIE_PROJET_REPOSITORY,
  type SortieProjetRepository,
} from '../ports/repositories/sortie-projet.repository';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../ports/repositories/project.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from 'src/investments/applications/ports/repositories/investment.repository';
import { ProjectStatus } from '../../domains/enums/project-status.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { PlatformFeesService } from 'src/common/platform-fees/platform-fees.service';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AmlMonitorService } from 'src/common/aml/aml-monitor.service';

const TAUX_IR_PV = 0.19; // PV immobilière 19 %
const TAUX_CSG_PV = 0.172; // CSG 17.2 %

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ExecuteSortieResult {
  sortie: SortieProjet;
  nbInvestisseursPayes: number;
  totalCapitalRembourse: number;
  totalPlusValueDistribuee: number;
  performanceFeePrelevee: number;
  totalIR: number;
  totalCSG: number;
}

/**
 * Exécute la distribution finale d'une sortie (vente du bien) :
 *
 * Pour chaque investisseur CONFIRME du projet :
 *   - capitalRembourse = inv.montant (1:1, retour de capital, non imposable)
 *   - plusValuePart = PV nette de frais × (inv.montant / COLLECTÉ RÉEL)
 *   - Si plusValuePart > 0 :
 *       IR_PV = plusValuePart × 0.19    (PV immobilière)
 *       CSG_PV = plusValuePart × 0.172
 *       net = capitalRembourse + plusValuePart - IR_PV - CSG_PV
 *   - Si plusValuePart ≤ 0 (moins-value) :
 *       net = capitalRembourse + plusValuePart  (l'investisseur prend la perte sur capital)
 *
 * Workflow :
 *   - SortieProjet doit être en statut ACTEE
 *   - Transaction atomique : crédit wallets + séquestres + ledger
 *   - Projet → CLOTURE
 *   - SortieProjet → DISTRIBUEE
 *
 * Idempotency keys : `sortie:capital:{sortieId}:{invId}`, `sortie:pv:...`,
 *                    `sortie:ir:...`, `sortie:csg:...`
 */
@Injectable()
export class ExecuteSortieUseCase {
  private readonly logger = new Logger(ExecuteSortieUseCase.name);

  constructor(
    @Inject(SORTIE_PROJET_REPOSITORY)
    private readonly sortieRepo: SortieProjetRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: ProjectRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepo: InvestmentRepository,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
    private readonly amlMonitor: AmlMonitorService,
    private readonly platformFees: PlatformFeesService,
  ) {}

  async execute(
    sortieId: string,
    adminUserId?: number,
    adminRole?: string,
  ): Promise<ExecuteSortieResult> {
    const sortie = await this.sortieRepo.findById(sortieId);
    if (!sortie) throw new NotFoundException('Sortie introuvable.');
    if (sortie.statut !== StatutSortie.ACTEE) {
      throw new BadRequestException(
        `Statut actuel "${sortie.statut}" — seul ACTEE peut être exécuté.`,
      );
    }

    const projet = await this.projectRepo.findProjectById(sortie.projetId);
    if (!projet) throw new NotFoundException('Projet introuvable.');

    const investissements = await this.investmentRepo.findByProjetId(
      sortie.projetId,
    );
    const eligibles = investissements.filter(
      (i) => i.statut === InvestmentStatus.CONFIRME,
    );

    // B3 — ASSIETTE DU PRORATA : LE COLLECTÉ RÉEL, PAS L'OBJECTIF.
    //
    // Le prorata était `inv.montant / projet.capitalCible`. Sur un projet
    // financé à 60 % de son objectif, la somme des quotes-parts valait 0,6 :
    // seuls 60 % de la plus-value étaient distribués, et les 40 % restants ne
    // revenaient à personne. Les investisseurs présents supportent le risque
    // sur ce qu'ils ont RÉELLEMENT engagé — la plus-value se partage donc sur
    // cette même assiette, et la somme des quotes-parts vaut 1 par
    // construction.
    //
    // Vaut 0 UNIQUEMENT quand aucun investissement n'est confirmé — cas où la
    // boucle de distribution ne s'exécute pas une seule fois, donc où aucune
    // division n'a lieu. Un projet dont tous les souscripteurs se sont
    // rétractés doit pouvoir être clôturé : on ne lève pas.
    const collecteReelle = round2(
      eligibles.reduce((total, inv) => total + Number(inv.montant), 0),
    );

    // Frais sur plus-value à la vente du bien (taux configurable
    // propertySaleGainFeePct) — prélevé par la plateforme sur la PV positive
    // AVANT distribution aux investisseurs. 0 si moins-value.
    const performanceFee = await this.platformFees.computePropertySaleGainFee(
      Number(sortie.plusValueBrute),
    );
    const plusValueDistribuable = round2(sortie.plusValueBrute - performanceFee);

    let nbInvestisseursPayes = 0;
    let totalCapitalRembourse = 0;
    let totalPlusValueDistribuee = 0;
    let totalIR = 0;
    let totalCSG = 0;

    await this.dataSource.transaction(async (em) => {
      let walletIR: WalletEntity | null = null;
      let walletCSG: WalletEntity | null = null;

      // B2 — LA CONTREPARTIE QUI MANQUAIT.
      //
      // Les cinq écritures de cette sortie n'avaient PAS de `walletSource` :
      // elles créditaient les investisseurs, les séquestres fiscaux et les
      // frais de plateforme sans jamais débiter personne. Le grand livre
      // fabriquait donc des euros à chaque sortie de projet — « Σ crédits −
      // Σ débits » ne se rapprochait plus d'aucun solde, et l'écart
      // n'apparaissait qu'au rapprochement du lendemain, sans cause
      // identifiable.
      //
      // La contrepartie est le portefeuille TECHNIQUE du projet, exactement
      // comme pour le règlement d'une échéance (`pay-echeance.usecase.ts`) :
      // c'est lui qui a reçu le produit de la vente, c'est de lui que part la
      // distribution. Le débit est passé À LA FIN, pour le TOTAL réellement
      // écrit — ainsi débit et crédits s'équilibrent au centime par
      // construction, quels que soient les arrondis par investisseur.
      const walletProjet = await this.findOrCreateWalletProjet(
        em,
        sortie.projetId,
      );
      let montantADebiter = 0;

      // Crédit du wallet FRAIS_PLATEFORME avec la performance fee
      if (performanceFee > 0) {
        let walletPlat = await em.findOne(WalletEntity, {
          where: { type: WalletType.FRAIS_PLATEFORME },
        });
        // Devise sera prise sur le premier wallet investisseur, fallback EUR
        const fallbackDevise = 'EUR';
        if (!walletPlat) {
          walletPlat = await em.save(
            WalletEntity,
            em.create(WalletEntity, {
              type: WalletType.FRAIS_PLATEFORME,
              proprietaireUserId: null,
              fournisseurRef: 'PLAT-FEES-001',
              devise: fallbackDevise,
              solde: 0,
            }),
          );
        }
        walletPlat.solde = Number(walletPlat.solde) + performanceFee;
        await em.save(WalletEntity, walletPlat);

        montantADebiter = round2(montantADebiter + performanceFee);
        await em.save(
          TransactionEntity,
          em.create(TransactionEntity, {
            walletSource: walletProjet.id,
            walletDestination: walletPlat.id,
            type: TransactionType.SOUSCRIPTION,
            montant: performanceFee,
            devise: walletPlat.devise,
            statut: TransactionStatus.REUSSI,
            fournisseur: TransactionFournisseur.INTERNE,
            projetId: sortie.projetId,
            idempotencyKey: `sortie:performance-fee:${sortieId}`,
            fraisPsp: 0,
            fraisPlateforme: 0,
            metadata: {
              source: 'gain_vente_bien',
              sortieId,
              plusValueBrute: Number(sortie.plusValueBrute),
            },
          }),
        );
      }

      for (const inv of eligibles) {
        const wallet = await em.findOne(WalletEntity, {
          where: {
            proprietaireUserId: inv.utilisateurId,
            type: WalletType.INVESTISSEUR,
          },
        });
        if (!wallet) {
          this.logger.warn(
            `Wallet investisseur user=${inv.utilisateurId} introuvable — ignoré.`,
          );
          continue;
        }

        const capitalRembourse = round2(Number(inv.montant));
        const pourcentage = Number(inv.montant) / collecteReelle;
        // PV distribuée = PV NETTE de performance fee × pourcentage détention
        const plusValuePart = round2(plusValueDistribuable * pourcentage);

        let irPV = 0;
        let csgPV = 0;
        if (plusValuePart > 0) {
          irPV = round2(plusValuePart * TAUX_IR_PV);
          csgPV = round2(plusValuePart * TAUX_CSG_PV);
        }
        const netVerse = round2(
          capitalRembourse + plusValuePart - irPV - csgPV,
        );

        // Ce qui sort RÉELLEMENT du projet pour cet investisseur : le net qui
        // lui revient, plus les deux retenues fiscales consignées ailleurs.
        // La somme de ces trois crédits, et elle seule, définit le débit.
        montantADebiter = round2(montantADebiter + netVerse + irPV + csgPV);

        // Crédit wallet investisseur (peut être < capitalRembourse si moins-value)
        wallet.solde = Number(wallet.solde) + netVerse;
        await em.save(WalletEntity, wallet);

        // Séquestres IR/CSG si fiscalité applicable
        if (irPV > 0) {
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
          walletIR.solde = Number(walletIR.solde) + irPV;
          await em.save(WalletEntity, walletIR);
        }
        if (csgPV > 0) {
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
          walletCSG.solde = Number(walletCSG.solde) + csgPV;
          await em.save(WalletEntity, walletCSG);
        }

        // Ledger : remboursement capital
        await em.save(
          TransactionEntity,
          em.create(TransactionEntity, {
            walletSource: walletProjet.id,
            walletDestination: wallet.id,
            type: TransactionType.REMBOURSEMENT_CAPITAL,
            montant: capitalRembourse,
            devise: wallet.devise,
            statut: TransactionStatus.REUSSI,
            fournisseur: TransactionFournisseur.INTERNE,
            investissementId: inv.id,
            projetId: sortie.projetId,
            idempotencyKey: `sortie:capital:${sortieId}:${inv.id}`,
            fraisPsp: 0,
            fraisPlateforme: 0,
          }),
        );

        // Ledger : plus-value (peut être négative)
        if (plusValuePart !== 0) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              walletSource: walletProjet.id,
              walletDestination: wallet.id,
              type: TransactionType.PAIEMENT_INTERETS,
              montant: plusValuePart,
              devise: wallet.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              investissementId: inv.id,
              projetId: sortie.projetId,
              idempotencyKey: `sortie:pv:${sortieId}:${inv.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
            }),
          );
        }

        if (irPV > 0 && walletIR) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              // Source = l'INVESTISSEUR, pas le projet : la retenue est prélevée
              // sur ce qui lui revient. Le projet lui verse le brut (capital +
              // plus-value), il en reverse la part fiscale au séquestre. Sans
              // cette orientation, le registre créditait l'investisseur du BRUT
              // alors que son portefeuille ne reçoit que le NET, et le
              // rapprochement affichait un écart égal à la retenue sur CHAQUE
              // investisseur.
              walletSource: wallet.id,
              walletDestination: walletIR.id,
              type: TransactionType.IMPOTS,
              montant: irPV,
              devise: wallet.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              investissementId: inv.id,
              projetId: sortie.projetId,
              idempotencyKey: `sortie:ir:${sortieId}:${inv.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
            }),
          );
        }
        if (csgPV > 0 && walletCSG) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              // Source = l'INVESTISSEUR, pas le projet : la retenue est prélevée
              // sur ce qui lui revient. Le projet lui verse le brut (capital +
              // plus-value), il en reverse la part fiscale au séquestre. Sans
              // cette orientation, le registre créditait l'investisseur du BRUT
              // alors que son portefeuille ne reçoit que le NET, et le
              // rapprochement affichait un écart égal à la retenue sur CHAQUE
              // investisseur.
              walletSource: wallet.id,
              walletDestination: walletCSG.id,
              type: TransactionType.IMPOTS,
              montant: csgPV,
              devise: wallet.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              investissementId: inv.id,
              projetId: sortie.projetId,
              idempotencyKey: `sortie:csg:${sortieId}:${inv.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
            }),
          );
        }

        // AML check sur le versement final (capital + PV nette)
        await this.amlMonitor
          .check({
            userId: inv.utilisateurId,
            amount: netVerse,
            context: 'sortie',
            reference: `${sortieId}:${inv.id}`,
          })
          .catch(() => {});

        nbInvestisseursPayes++;
        totalCapitalRembourse += capitalRembourse;
        totalPlusValueDistribuee += plusValuePart;
        totalIR += irPV;
        totalCSG += csgPV;
      }

      // ── DÉBIT DE LA CONTREPARTIE ────────────────────────────────────────
      // Passé pour le total RÉELLEMENT écrit en crédits, et non pour un total
      // théorique recalculé : débit et crédits s'équilibrent donc au centime,
      // quels que soient les arrondis par investisseur.
      //
      // Découvert TOLÉRÉ et rendu VISIBLE, comme au règlement d'une échéance
      // (`pay-echeance.usecase.ts`) : la distribution d'une sortie est une
      // obligation envers des investisseurs dont le bien est déjà vendu, pas
      // une dépense discrétionnaire. Refuser le débit transformerait un défaut
      // d'alimentation du projet en impayé pour l'investisseur. On distribue,
      // et l'écart devient un incident instruit plutôt qu'un silence.
      await this.debiterProjet(em, walletProjet.id, montantADebiter, sortieId);

      // Transition projet → CLOTURE
      await this.projectRepo.updateProjectStatus(
        sortie.projetId,
        ProjectStatus.CLOTURE,
      );

      // Transition sortie → DISTRIBUEE
      sortie.statut = StatutSortie.DISTRIBUEE;
      await this.sortieRepo.save(sortie);
    });

    const result: ExecuteSortieResult = {
      sortie,
      nbInvestisseursPayes,
      totalCapitalRembourse: round2(totalCapitalRembourse),
      totalPlusValueDistribuee: round2(totalPlusValueDistribuee),
      performanceFeePrelevee: performanceFee,
      totalIR: round2(totalIR),
      totalCSG: round2(totalCSG),
    };
    this.logger.log(
      `Sortie exécutée : sortie=${sortieId} payés=${nbInvestisseursPayes} capital=${result.totalCapitalRembourse} PV nette=${result.totalPlusValueDistribuee} perf.fee=${performanceFee}`,
    );

    // Audit log — Phase 10
    if (adminUserId != null) {
      await this.auditLog
        .create(
          String(adminUserId),
          adminRole ?? UserRole.SUPER_ADMIN,
          'equity.sortie.execute',
          'sortie_projet',
          sortieId,
          undefined,
          undefined,
          {
            projetId: sortie.projetId,
            prixRevente: sortie.prixRevente,
            plusValueBrute: sortie.plusValueBrute,
            performanceFee: result.performanceFeePrelevee,
            nbInvestisseursPayes,
            totalCapitalRembourse: result.totalCapitalRembourse,
            totalPlusValueDistribuee: result.totalPlusValueDistribuee,
          },
        )
        .catch(() => {});
    }

    return result;
  }

  /**
   * Portefeuille TECHNIQUE du projet, verrouillé pour la durée de la
   * transaction — créé s'il n'existe pas encore (projet dont la trésorerie
   * n'a jamais été mouvementée).
   *
   * Verrou pessimiste : la sortie débite ce portefeuille en fin de parcours,
   * après une série de lectures ; sans verrou, un règlement d'échéance
   * concurrent pourrait s'intercaler entre le calcul et le débit.
   */
  private async findOrCreateWalletProjet(
    em: EntityManager,
    projetId: string,
  ): Promise<WalletEntity> {
    const existant = await em.findOne(WalletEntity, {
      where: { projetId, type: WalletType.TECHNIQUE_PROJET },
      lock: { mode: 'pessimistic_write' },
    });
    if (existant) return existant;

    return em.save(
      WalletEntity,
      em.create(WalletEntity, {
        type: WalletType.TECHNIQUE_PROJET,
        proprietaireUserId: null,
        projetId,
        fournisseurRef: `PROJET-${projetId}`,
        devise: 'EUR',
        solde: 0,
      }),
    );
  }

  /**
   * Débit atomique du portefeuille du projet. INCONDITIONNEL et assumé : voir
   * l'appelant pour la justification du découvert toléré.
   */
  private async debiterProjet(
    em: EntityManager,
    walletId: string,
    montant: number,
    sortieId: string,
  ): Promise<void> {
    if (!montant) return;

    const avant = await em.findOne(WalletEntity, { where: { id: walletId } });
    const soldeApres = round2(Number(avant?.solde ?? 0) - montant);

    await em
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => 'solde - :montant' })
      .setParameter('montant', montant)
      .where('id = :id', { id: walletId })
      .execute();

    if (soldeApres < 0) {
      this.logger.warn(
        `Portefeuille projet ${walletId} en découvert de ${Math.abs(soldeApres).toFixed(2)} € ` +
          `après distribution de la sortie ${sortieId}. Le projet doit être alimenté.`,
      );
    }
  }
}
