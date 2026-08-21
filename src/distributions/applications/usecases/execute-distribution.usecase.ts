import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AmlMonitorService } from 'src/common/aml/aml-monitor.service';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  ) {}

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

    await this.dataSource.transaction(async (em) => {
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
        walletPlat.solde = round2(
          Number(walletPlat.solde) + fraisPlateformeAnnuel + fraisGestionLocative,
        );
        await em.save(WalletEntity, walletPlat);

        if (fraisPlateformeAnnuel > 0) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              walletSource: null,
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
              walletSource: null,
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

        // Crédit wallet investisseur
        wallet.solde = Number(wallet.solde) + part.montantNet;
        await em.save(WalletEntity, wallet);

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
          walletIR.solde = Number(walletIR.solde) + part.prelevementIR;
          await em.save(WalletEntity, walletIR);
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
          walletCSG.solde = Number(walletCSG.solde) + part.prelevementCSG;
          await em.save(WalletEntity, walletCSG);
        }

        // Ledger : crédit principal
        await em.save(
          TransactionEntity,
          em.create(TransactionEntity, {
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
}
