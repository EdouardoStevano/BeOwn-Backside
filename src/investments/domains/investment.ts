import { InvestmentStatus } from './enums/investment-status.enum';

export interface InvestmentProjet {
  id: string;
  titre: string;
  ville: string | null;
  pays: string;
  type: string;
  triCible: number | null;
  dureeMois: number;
  prixFraction: number | null;
  nbFractions: number | null;
}

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
  projet?: InvestmentProjet;
}
