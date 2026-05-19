import { DistributionPart } from '../../../domains/distribution-part';

export const DISTRIBUTION_PART_REPOSITORY = Symbol(
  'DISTRIBUTION_PART_REPOSITORY',
);

export interface DistributionPartRepository {
  saveAll(parts: DistributionPart[]): Promise<DistributionPart[]>;
  findByPeriode(periodeDistributionId: string): Promise<DistributionPart[]>;
  findByInvestissement(investissementId: string): Promise<DistributionPart[]>;
  findUnpaid(): Promise<DistributionPart[]>;
  markPaid(id: string, payeLe: Date): Promise<void>;
}
