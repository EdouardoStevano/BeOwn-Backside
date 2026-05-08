import { KycNiveau, KycStatus } from './enums/kyc-status.enum';

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
