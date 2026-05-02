import { CategoriePsfp } from './enums/kyc-status.enum';

export class ProfilPP {
  utilisateurId: number;
  civilite: string | null;
  prenom: string;
  nom: string;
  nomNaissance: string | null;
  dateNaissance: Date;
  lieuNaissance: string | null;
  paysNaissance: string | null;
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
  createdAt: Date;
  updatedAt: Date;
}
