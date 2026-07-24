import { StatutDeclaration } from './enums/statut-declaration.enum';

/**
 * Loyer effectivement encaissé sur une période, déclaré par le porteur.
 * Doit être validé par un admin (`StatutDeclaration.VALIDE`) avant d'être
 * agrégé par le moteur de distribution.
 *
 * `preuves` : liste d'URLs vers des justificatifs (relevé bancaire, quittance).
 */
export class LoyerEncaisse {
  id: string;
  bailId: string;
  periode: string; // format 'YYYY-MM'
  montant: number;
  dateEncaissement: Date;
  preuves: string[]; // URLs justificatifs (relevé bancaire, etc.)
  statut: StatutDeclaration;
  declareParUserId: number;
  valideParUserId: number | null;
  valideLe: Date | null;
  motifRejet: string | null;
  createdAt: Date;
  updatedAt: Date;
}
