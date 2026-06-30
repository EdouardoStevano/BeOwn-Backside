/**
 * Document fiscal annuel (IFU - Imprimé Fiscal Unique, formulaire 2561 en France).
 * Récapitule les montants IR + CSG retenus pour un investisseur sur une année.
 * Généré annuellement (cron 15 janvier de N+1) ou à la demande.
 */
export class DocumentFiscal {
  id: string;
  userId: number;
  annee: number; // ex. 2026
  montantBrut: number;
  montantIR: number;
  montantCSG: number;
  montantNet: number;
  pdfUrl: string | null; // null tant que pas généré
  genereeLe: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
