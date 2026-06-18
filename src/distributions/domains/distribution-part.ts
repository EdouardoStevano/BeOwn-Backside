/**
 * Part de revenu calculée pour un investisseur sur une période donnée.
 *
 * Invariants :
 *   - pourcentageDetention ∈ [0, 1]
 *   - montantBrut = revenuNetPeriode × pourcentageDetention (au centime)
 *   - prelevementIR = montantBrut × 0.128 (interêts uniquement, à raffiner Phase 3)
 *   - prelevementCSG = montantBrut × 0.172
 *   - montantNet = montantBrut − prelevementIR − prelevementCSG
 */
export class DistributionPart {
  id: string;
  periodeDistributionId: string;
  investissementId: string;
  pourcentageDetention: number; // 0..1
  montantBrut: number;
  prelevementIR: number;
  prelevementCSG: number;
  montantNet: number;
  payeLe: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
