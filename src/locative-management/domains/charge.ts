import { StatutDeclaration } from './enums/statut-declaration.enum';
import { TypeCharge } from './enums/type-charge.enum';

/**
 * Dépense d'exploitation (maintenance, assurance, taxe, gestion) déclarée
 * par le porteur, validée par admin, déductible du revenu locatif.
 *
 * `justificatifs` : URLs vers les factures/devis.
 */
export class Charge {
  id: string;
  projetId: string;
  type: TypeCharge;
  description: string;
  montant: number;
  periode: string; // 'YYYY-MM'
  dateOperation: Date;
  justificatifs: string[];
  statut: StatutDeclaration;
  declareParUserId: number;
  valideParUserId: number | null;
  valideLe: Date | null;
  motifRejet: string | null;
  createdAt: Date;
  updatedAt: Date;
}
