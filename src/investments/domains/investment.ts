import { InvestmentStatus } from './enums/investment-status.enum';

export class Investment {
  id: string;
  projetId: string;
  utilisateurId: number;
  montant: number;
  instrument: string;
  nbTitres: number | null;
  valeurTitre: number | null;
  statut: InvestmentStatus;
  delaiRetractationJusquAu: Date | null;
  bulletinDocId: string | null;
  signatureId: string | null;
  reservationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
