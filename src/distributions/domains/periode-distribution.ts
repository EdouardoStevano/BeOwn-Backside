import { StatutPeriodeDistribution } from './enums/statut-periode-distribution.enum';

/**
 * Période de calcul mensuelle pour un projet equity. Agrège les loyers et
 * charges validés du mois et expose un revenu net distribuable.
 *
 * Invariants :
 *   - totalLoyers ≥ 0
 *   - totalCharges ≥ 0
 *   - revenuNet = totalLoyers − totalCharges (peut être négatif si déficitaire)
 *   - somme(DistributionPart.montantBrut) ≈ revenuNet (à 1 centime près)
 */
export class PeriodeDistribution {
  id: string;
  projetId: string;
  periode: string; // 'YYYY-MM'
  totalLoyers: number;
  totalCharges: number;
  revenuNet: number;
  statut: StatutPeriodeDistribution;
  calculeeLe: Date;
  valideeLe: Date | null;
  distribueeLe: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
