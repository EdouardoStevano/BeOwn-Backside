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
 *
 * fraisPlateformeAnnuel / fraisGestionLocative : montants de frais figés au
 * CALCUL (snapshot de taux R1) mais dont l'ENCAISSEMENT (crédit wallet +
 * transactions ledger) n'a lieu qu'à l'EXECUTION — voir
 * ExecuteDistributionUseCase. Le calcul ne fait que projeter ; l'argent ne
 * bouge jamais avant l'exécution, ce qui garde l'annulation d'une période
 * CALCULEE/VALIDEE totalement gratuite (rien à reverser).
 */
export class PeriodeDistribution {
  id: string;
  projetId: string;
  periode: string; // 'YYYY-MM'
  totalLoyers: number;
  totalCharges: number;
  revenuNet: number;
  fraisPlateformeAnnuel: number;
  fraisGestionLocative: number;
  fraisPlafonnes: boolean;
  statut: StatutPeriodeDistribution;
  calculeeLe: Date;
  valideeLe: Date | null;
  distribueeLe: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
