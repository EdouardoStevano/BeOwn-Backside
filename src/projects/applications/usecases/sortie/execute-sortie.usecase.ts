import { Inject, Injectable, Logger } from '@nestjs/common';
import { AmlMonitorService } from 'src/common/aml/aml-monitor.service';
import { PlatformFeesService } from 'src/common/platform-fees/platform-fees.service';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { INVESTMENT_REPOSITORY } from 'src/investments/applications/ports/repositories/investment.repository';
import type { InvestmentRepository } from 'src/investments/applications/ports/repositories/investment.repository';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import {
  ProjetIntrouvableError,
  SortieIntrouvableError,
  TransitionSortieInvalideError,
} from 'src/projects/domains/errors';
import { StatutSortie } from 'src/projects/domains/enums/statut-sortie.enum';
import { RepartitionSortieService } from 'src/projects/domains/services/repartition-sortie.domain-service';
import { SortieProjet } from 'src/projects/domains/sortie-projet';
import { arrondirAuCentime } from 'src/projects/domains/value-objects/montant.vo';
import {
  SORTIE_SETTLEMENT_PORT,
  type SortieSettlementPort,
  type VersementSortie,
} from '../../ports/sortie-settlement.port';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../ports/repositories/project.repository';
import {
  SORTIE_PROJET_REPOSITORY,
  type SortieProjetRepository,
} from '../../ports/repositories/sortie-projet.repository';

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
 * Exécute la distribution finale d'une sortie : remboursement du capital,
 * versement de la plus-value nette, clôture du projet.
 *
 * Le use case faisait auparavant quatre métiers en trois cents lignes :
 * l'arithmétique de la répartition, l'écriture des wallets et du ledger, les
 * transitions d'état, l'audit. Il injectait pour cela une `DataSource`, un
 * `Repository<WalletEntity>` et un `Repository<TransactionEntity>` — de l'accès
 * base de données hors repository dans la couche applicative (§12.3), et les
 * tables d'un autre Bounded Context remontées jusqu'ici.
 *
 * Le partage est maintenant net :
 *
 * - **le domaine calcule** — `RepartitionSortieService`, pur et testable sans
 *   simuler un `EntityManager` ;
 * - **l'adapter écrit** — `SORTIE_SETTLEMENT_PORT`, une seule transaction, les
 *   clés d'idempotence inchangées ;
 * - **le use case orchestre** — il charge, éprouve les préconditions, demande
 *   le barème des frais, fait calculer, fait écrire, transitionne, audite.
 *
 * ⚠️ Correction de comportement : les deux transitions finales (projet →
 * `CLOTURE`, sortie → `DISTRIBUEE`) étaient écrites *à l'intérieur* du callback
 * `dataSource.transaction(...)`, mais par des repositories qui ouvrent leur
 * propre connexion — elles n'y ont donc jamais été. Un échec après le règlement
 * laissait les wallets crédités et la sortie toujours `ACTEE`, donc rejouable.
 * Elles sont désormais **après** le règlement, dans un ordre explicite : la
 * sortie passe `DISTRIBUEE` en premier, parce que c'est elle qui garde le
 * rejeu.
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
    @Inject(SORTIE_SETTLEMENT_PORT)
    private readonly settlement: SortieSettlementPort,
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
    if (!sortie) throw new SortieIntrouvableError();
    if (!sortie.estActee) {
      throw new TransitionSortieInvalideError(
        sortie.statut,
        StatutSortie.ACTEE,
        StatutSortie.DISTRIBUEE,
      );
    }

    const projet = await this.projectRepo.findProjectById(sortie.projetId);
    if (!projet) throw new ProjetIntrouvableError();

    const investissements = await this.investmentRepo.findByProjetId(
      sortie.projetId,
    );
    const eligibles = investissements.filter(
      (i) => i.statut === InvestmentStatus.CONFIRME,
    );

    // Frais sur la plus-value à la vente du bien (taux configurable
    // `propertySaleGainFeePct`) — prélevés par la plateforme AVANT distribution.
    // Le service rend 0 sur une moins-value.
    const fraisPerformance = await this.platformFees.computePropertySaleGainFee(
      Number(sortie.plusValueBrute),
    );
    const plusValueDistribuable = arrondirAuCentime(
      sortie.plusValueBrute - fraisPerformance,
    );

    const repartition = RepartitionSortieService.repartir(
      eligibles.map((inv) => ({
        investissementId: inv.id,
        utilisateurId: inv.utilisateurId,
        montant: Number(inv.montant),
      })),
      plusValueDistribuable,
      projet.capitalCible,
    );

    const { versementsEffectues } = await this.settlement.regler({
      sortieId,
      projetId: sortie.projetId,
      plusValueBrute: Number(sortie.plusValueBrute),
      fraisPerformance,
      versements: repartition.quotesParts,
    });

    // La sortie d'abord : c'est son statut qui interdit le rejeu.
    sortie.marquerDistribuee();
    await this.sortieRepo.save(sortie);
    projet.cloturerApresSortie();
    await this.projectRepo.saveProject(projet);

    const result = totaliser(sortie, versementsEffectues, fraisPerformance);
    this.logger.log(
      `Sortie exécutée : sortie=${sortieId} payés=${result.nbInvestisseursPayes} capital=${result.totalCapitalRembourse} PV nette=${result.totalPlusValueDistribuee} perf.fee=${fraisPerformance}`,
    );

    await this.surveillerVersements(sortieId, versementsEffectues);
    await this.auditer(result, sortieId, adminUserId, adminRole);

    return result;
  }

  /**
   * Contrôle LCB-FT sur chaque versement final, en best-effort : il éclaire une
   * décision de conformité *a posteriori*, il ne conditionne pas un versement
   * déjà passé.
   */
  private async surveillerVersements(
    sortieId: string,
    versements: readonly VersementSortie[],
  ): Promise<void> {
    await Promise.all(
      versements.map((versement) =>
        this.amlMonitor
          .check({
            userId: versement.utilisateurId,
            amount: versement.netVerse,
            context: 'sortie',
            reference: `${sortieId}:${versement.investissementId}`,
          })
          .catch(() => {}),
      ),
    );
  }

  private async auditer(
    result: ExecuteSortieResult,
    sortieId: string,
    adminUserId?: number,
    adminRole?: string,
  ): Promise<void> {
    if (adminUserId == null) return;
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
          projetId: result.sortie.projetId,
          prixRevente: result.sortie.prixRevente,
          plusValueBrute: result.sortie.plusValueBrute,
          performanceFee: result.performanceFeePrelevee,
          nbInvestisseursPayes: result.nbInvestisseursPayes,
          totalCapitalRembourse: result.totalCapitalRembourse,
          totalPlusValueDistribuee: result.totalPlusValueDistribuee,
        },
      )
      .catch(() => {});
  }
}

/**
 * Totaux du compte rendu, calculés sur les versements **réellement passés**.
 *
 * La distinction compte : un investisseur sans wallet est ignoré par l'adapter
 * de règlement, et le totaliser reviendrait à annoncer un capital remboursé qui
 * n'a jamais quitté la plateforme.
 */
function totaliser(
  sortie: SortieProjet,
  versements: readonly VersementSortie[],
  fraisPerformance: number,
): ExecuteSortieResult {
  const somme = (extraire: (versement: VersementSortie) => number) =>
    arrondirAuCentime(versements.reduce((t, v) => t + extraire(v), 0));

  return {
    sortie,
    nbInvestisseursPayes: versements.length,
    totalCapitalRembourse: somme((v) => v.capitalRembourse),
    totalPlusValueDistribuee: somme((v) => v.plusValuePart),
    performanceFeePrelevee: fraisPerformance,
    totalIR: somme((v) => v.impotRevenu),
    totalCSG: somme((v) => v.prelevementsSociaux),
  };
}
