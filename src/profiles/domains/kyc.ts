import { KycNiveau, KycStatus } from './enums/kyc-status.enum';

export interface KycIdentiteExtrait {
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  nationalite?: string;
  typeDocument?: string;
  numeroDocument?: string;
  dateExpiration?: string;
  documentFrontFileId?: string;
  documentBackFileId?: string;
  selfieFileId?: string;
}

export class Kyc {
  id: string;
  utilisateurId: number;
  statut: KycStatus;
  niveau: KycNiveau;
  scoreRisque: number | null;
  fournisseur: string;
  fournisseurRef: string | null;
  valideJusquAu: Date | null;
  motifRefus: string | null;
  stripeReportId: string | null;
  identiteExtrait: KycIdentiteExtrait | null;
  createdAt: Date;
  updatedAt: Date;
  // Populated when loaded with relations (admin list)
  utilisateur?: {
    userId: number;
    firstname?: string;
    lastname?: string;
    role: string;
    status: string;
    createdAt?: Date;
    userEmail?: { email: string };
  };
}
