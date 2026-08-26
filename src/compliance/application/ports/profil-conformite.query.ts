import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';

export const PROFIL_CONFORMITE_QUERY = Symbol('PROFIL_CONFORMITE_QUERY');

/** Le verdict PSFP opposable à un titulaire, quelle que soit sa nature. */
export interface EligibiliteDuTitulaire {
  investorId: number;
  categoriePsfp: CategoriePsfp;
  estNonAverti: boolean;
  /** `null` pour qui n'est pas non averti — la recommandation ne le concerne pas. */
  plafondConseille: number | null;
  patrimoineDeclare: number | null;
}

/** Une ligne de la surveillance périodique. */
export interface ContactDu {
  investorId: number;
  niveauRisque: NiveauRisque | null;
  dernierContactAdmin: Date | null;
  prochainContactDu: Date | null;
}

/**
 * Ce que les autres lisent du dossier de conformité, sans en tenir l'agrégat.
 *
 * **`subscription` en est le client principal.** Il lisait jusqu'ici l'agrégat
 * `ProfilPP` pour y prendre la catégorie et le plafond — deux valeurs que le
 * profil ne calculait pas, dont il ne tenait qu'une copie, et qui n'existaient
 * donc **pas du tout pour une personne morale**, faute de ligne `profil_pp`.
 * Ce port est clé sur le titulaire : les deux natures y sont servies pareil.
 *
 * Il rend des primitives, jamais un agrégat ni une entité (§11) : le contexte
 * en aval retient un verdict, il ne rejoue pas la règle qui l'a produit.
 */
export interface ProfilConformiteQuery {
  /**
   * L'éligibilité PSFP d'un titulaire.
   *
   * Jamais `null` : qui n'a pas répondu au questionnaire **est** non averti.
   * Le classement se gagne, il ne se présume pas — et rendre `null` obligerait
   * chaque appelant à retrouver ce repli, en oubliant parfois.
   */
  eligibilite(investorId: number): Promise<EligibiliteDuTitulaire>;

  /** Titulaires dont le contact périodique est dû — surveillance PSFP art. 21. */
  contactsDus(limite: number): Promise<ContactDu[]>;
}
