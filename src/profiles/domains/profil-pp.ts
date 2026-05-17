import { CategoriePsfp } from './enums/kyc-status.enum';

export class ProfilPP {
  utilisateurId: number;
  civilite: string | null;
  dateNaissance: Date | null;
  lieuNaissance: string | null;
  nationalite: string | null;
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  profession: string | null;
  secteurActivite: string | null;
  pep: boolean;
  residenceFiscale: string | null;
  nif: string | null;
  categoriePsfp: CategoriePsfp;
  patrimoineDeclare: number | null;
  montantMaxConseille: number | null;
  niveauRisque: string | null = null;
  dernierContactAdmin: Date | null = null;
  prochainContactDu: Date | null = null;
  createdAt: Date;
  updatedAt: Date;
}
