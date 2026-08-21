import { CategorieInvestisseur } from './investor-classification';

export class ProfilPP {
  utilisateurId: number;
  civilite: string | null;
  prenom: string;
  nom: string;
  nomNaissance: string | null;
  paysNaissance: string | null;
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
  categoriePsfp: CategorieInvestisseur;
  /** Patrimoine net au sens de l'art. 21(5) du règlement (UE) 2020/1503. */
  patrimoineNetCalcule: number | null;
  /** max(1 000 €, 5 % du patrimoine net) — art. 21(7). */
  seuilAvertissementCalcule: number | null;
  /** Art. 21(2) : échéance de réexamen de l'évaluation. */
  evaluationExpireLe: Date | null = null;
  niveauRisque: string | null = null;
  dernierContactAdmin: Date | null = null;
  prochainContactDu: Date | null = null;
  createdAt: Date;
  updatedAt: Date;
}
