import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import { computePerformanceFee } from 'src/common/platform-fees/platform-fees.constants';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
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
 *   - plusValuePart = sortie.plusValueBrute × (inv.montant / projet.capitalCible)
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
  ) {}

  async execute(
    sortieId: string,
    adminUserId?: number,
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
    const capitalCible = Number(projet.capitalCible);
    if (!capitalCible || capitalCible <= 0) {
      throw new BadRequestException('capitalCible du projet invalide.');
    }

    const investissements = await this.investmentRepo.findByProjetId(
      sortie.projetId,
    );
    const eligibles = investissements.filter(
      (i) => i.statut === InvestmentStatus.CONFIRME,
    );

    // Performance fee (Phase 9) — prélevée par la plateforme sur la PV positive
    // AVANT distribution aux investisseurs.
    const performanceFee = computePerformanceFee(sortie.plusValueBrute);
    const plusValueDistribuable = round2(sortie.plusValueBrute - performanceFee);

    let nbInvestisseursPayes = 0;
    let totalCapitalRembourse = 0;
    let totalPlusValueDistribuee = 0;
    let totalIR = 0;
    let totalCSG = 0;

    await this.dataSource.transaction(async (em) => {
      let walletIR: WalletEntity | null = null;
      let walletCSG: WalletEntity | null = null;

      // Crédit du wallet FRAIS_PLATEFORME avec la performance fee
      if (performanceFee > 0) {
        let walletPlat = await em.findOne(WalletEntity, {
          where: { type: WalletType.FRAIS_PLATEFORME },
        });
        // Devise sera prise sur le premier wallet investisseur, fallback XOF
        const fallbackDevise = 'XOF';
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

        await em.save(
          TransactionEntity,
          em.create(TransactionEntity, {
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
        const pourcentage = Number(inv.montant) / capitalCible;
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
          UserRole.ADMIN,
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
}
