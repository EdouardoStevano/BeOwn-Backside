import type { EntityManager } from 'typeorm';
import { PeriodeDistribution } from '../../../domains/periode-distribution';
import { StatutPeriodeDistribution } from '../../../domains/enums/statut-periode-distribution.enum';

export const PERIODE_DISTRIBUTION_REPOSITORY = Symbol(
  'PERIODE_DISTRIBUTION_REPOSITORY',
);

export interface PeriodeDistributionRepository {
  /** `manager` optionnel : participe à la transaction de l'appelant. */
  save(
    p: PeriodeDistribution,
    manager?: EntityManager,
  ): Promise<PeriodeDistribution>;
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
