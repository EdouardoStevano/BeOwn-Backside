export enum StatutSortie {
  PROJETEE = 'projetee', // vente envisagée mais non actée
  ACTEE = 'actee', // acte de vente signé, prix encaissé
  DISTRIBUEE = 'distribuee', // capital + plus-value versés aux investisseurs
  ANNULEE = 'annulee',
}

/**
 * Événement de sortie (vente du bien) pour un projet equity.
 *
 * Invariants :
 *   - plusValueBrute = prixRevente − capitalCible
 *   - dateRevente ≤ now() quand statut = ACTEE
 */
export class SortieProjet {
  id: string;
  projetId: string;
  prixRevente: number;
  dateRevente: Date;
  plusValueBrute: number;
  statut: StatutSortie;
  acteVentePdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
