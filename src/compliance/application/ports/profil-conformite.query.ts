import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';
import { MotifInaptitude } from 'src/compliance/domain/domain-services/aptitude-du-profil.domain-service';

export const PROFIL_CONFORMITE_QUERY = Symbol('PROFIL_CONFORMITE_QUERY');

/** Le verdict PSFP opposable à un titulaire, quelle que soit sa nature. */
export interface EligibiliteDuTitulaire {
  investorId: number;
  /** La société au nom de laquelle vaut ce verdict ; `null` pour le titulaire. */
  societeId: string | null;
  categoriePsfp: CategoriePsfp;
  estNonAverti: boolean;
  /** `null` pour qui n'est pas non averti — la recommandation ne le concerne pas. */
  plafondConseille: number | null;
  patrimoineDeclare: number | null;
  /**
   * Ce souscripteur peut-il réaliser des opérations financières ?
   *
   * Pour le titulaire, c'est son KYC. Pour une société, c'est le verdict
   * composé par `aptitudeDeLaSociete` — KYC du représentant, immatriculation,
   * bénéficiaires déclarés et dossier de pièces complet. Le contexte en aval
   * retient ce verdict, il ne rejoue pas la règle qui l'a produit.
   */
  peutOperer: boolean;
  /** Ce qui l'en empêche, s'il ne le peut pas — vide sinon. */
  motifs: MotifInaptitude[];
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
   * L'éligibilité PSFP d'un titulaire, en son nom propre.
   *
   * Jamais `null` : qui n'a pas répondu au questionnaire **est** non averti.
   * Le classement se gagne, il ne se présume pas — et rendre `null` obligerait
   * chaque appelant à retrouver ce repli, en oubliant parfois.
   */
  eligibilite(investorId: number): Promise<EligibiliteDuTitulaire>;

  /**
   * L'éligibilité PSFP **d'une société** du titulaire.
   *
   * Elle a son propre classement — une SAS peut être professionnelle quand son
   * dirigeant est non-averti — et sa propre aptitude à opérer, composée du KYC
   * du représentant, de l'immatriculation, des bénéficiaires effectifs et du
   * dossier de pièces.
   *
   * C'est cette lecture que `subscription` et `reservation` doivent appeler
   * lorsqu'une souscription est faite au nom d'une société : leur opposer
   * `eligibilite(investorId)` reviendrait à plafonner la société comme son
   * représentant.
   */
  eligibiliteDeLaSociete(
    investorId: number,
    societeId: string,
  ): Promise<EligibiliteDuTitulaire>;

  /** Titulaires dont le contact périodique est dû — surveillance PSFP art. 21. */
  contactsDus(limite: number): Promise<ContactDu[]>;
}
