import { PeriodeDistribution } from '../../../domains/periode-distribution';
import { StatutPeriodeDistribution } from '../../../domains/enums/statut-periode-distribution.enum';

export const PERIODE_DISTRIBUTION_REPOSITORY = Symbol(
  'PERIODE_DISTRIBUTION_REPOSITORY',
);

export interface PeriodeDistributionRepository {
  save(p: PeriodeDistribution): Promise<PeriodeDistribution>;
  findById(id: string): Promise<PeriodeDistribution | null>;
  findByProjetEtPeriode(
    projetId: string,
    periode: string,
  ): Promise<PeriodeDistribution | null>;
  findByStatut(
    statut: StatutPeriodeDistribution,
  ): Promise<PeriodeDistribution[]>;
  findHistoriqueByProjet(projetId: string): Promise<PeriodeDistribution[]>;
}
