import { Inject, Injectable } from '@nestjs/common';
import { DistributionPart } from '../../domains/distribution-part';
import { PeriodeDistribution } from '../../domains/periode-distribution';
import {
  DISTRIBUTION_PART_REPOSITORY,
  type DistributionPartRepository,
} from '../ports/repositories/distribution-part.repository';
import {
  PERIODE_DISTRIBUTION_REPOSITORY,
  type PeriodeDistributionRepository,
} from '../ports/repositories/periode-distribution.repository';
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepository,
} from 'src/subscription/domain/repositories/investment.repository';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';

export interface InvestisseurDistributionPart extends DistributionPart {
  periode: PeriodeDistribution;
  projetId: string;
}

export interface InvestisseurDistributionSummary {
  capitalInvesti: number;
  totalGainsBruts: number;
  totalGainsNets: number;
  totalIR: number;
  totalCSG: number;
  nbDistributionsRecues: number;
  roiRealise: number; // 0..1+ : totalGainsNets / capitalInvesti
  parts: InvestisseurDistributionPart[];
}

/**
 * Pour un investisseur :
 *   - Récupère ses investissements CONFIRME
 *   - Récupère toutes les DistributionPart de ces investissements
 *   - Joint avec PeriodeDistribution pour exposer la période + le projet
 *   - Calcule les KPIs : capital investi, gains bruts/nets, ROI réalisé
 */
@Injectable()
export class GetInvestisseurDistributionHistoryUseCase {
  constructor(
    @Inject(DISTRIBUTION_PART_REPOSITORY)
    private readonly partRepo: DistributionPartRepository,
    @Inject(PERIODE_DISTRIBUTION_REPOSITORY)
    private readonly periodeRepo: PeriodeDistributionRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepo: InvestmentRepository,
  ) {}

  async execute(userId: number): Promise<InvestisseurDistributionSummary> {
    const investments = await this.investmentRepo.findByUserId(userId);
    const confirmes = investments.filter(
      (i) => i.statut === InvestmentStatus.CONFIRME,
    );

    const capitalInvesti = confirmes.reduce(
      (s, inv) => s + Number(inv.montant),
      0,
    );

    if (confirmes.length === 0) {
      return {
        capitalInvesti: 0,
        totalGainsBruts: 0,
        totalGainsNets: 0,
        totalIR: 0,
        totalCSG: 0,
        nbDistributionsRecues: 0,
        roiRealise: 0,
        parts: [],
      };
    }

    const invIds = confirmes.map((i) => i.id);
    const parts = await this.partRepo.findByInvestissementIds(invIds);

    // Fetch unique periodes
    const periodeIds = Array.from(
      new Set(parts.map((p) => p.periodeDistributionId)),
    );
    const periodes: Record<string, PeriodeDistribution> = {};
    for (const id of periodeIds) {
      const p = await this.periodeRepo.findById(id);
      if (p) periodes[id] = p;
    }

    const enriched: InvestisseurDistributionPart[] = parts.map((part) => ({
      ...part,
      periode: periodes[part.periodeDistributionId],
      projetId: periodes[part.periodeDistributionId]?.projetId ?? '',
    }));

    // Trier par période DESC
    enriched.sort((a, b) =>
      (b.periode?.periode ?? '').localeCompare(a.periode?.periode ?? ''),
    );

    const totalGainsBruts = parts.reduce((s, p) => s + p.montantBrut, 0);
    const totalGainsNets = parts
      .filter((p) => p.payeLe !== null) // seuls les versements effectifs
      .reduce((s, p) => s + p.montantNet, 0);
    const totalIR = parts.reduce((s, p) => s + p.prelevementIR, 0);
    const totalCSG = parts.reduce((s, p) => s + p.prelevementCSG, 0);
    const roiRealise =
      capitalInvesti > 0 ? totalGainsNets / capitalInvesti : 0;

    return {
      capitalInvesti: Math.round(capitalInvesti * 100) / 100,
      totalGainsBruts: Math.round(totalGainsBruts * 100) / 100,
      totalGainsNets: Math.round(totalGainsNets * 100) / 100,
      totalIR: Math.round(totalIR * 100) / 100,
      totalCSG: Math.round(totalCSG * 100) / 100,
      nbDistributionsRecues: parts.filter((p) => p.payeLe !== null).length,
      roiRealise: Math.round(roiRealise * 10000) / 10000,
      parts: enriched,
    };
  }
}
