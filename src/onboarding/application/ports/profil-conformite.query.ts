// Le classement PSFP vient du contexte Adéquation, par son **port** et non par
// son domaine : il est en amont de celui-ci (§3.4), et ce qu'il publie là est un
// contrat applicatif, pas un agrégat.
import type { ClassementDuTitulaire } from 'src/adequacy/application/ports/classement-du-titulaire.query';
import type { AptitudeDuProfil } from 'src/onboarding/domain/domain-services/aptitude-du-profil.domain-service';

export const PROFIL_CONFORMITE_QUERY = Symbol('PROFIL_CONFORMITE_QUERY');

/**
 * Le verdict PSFP opposable à un titulaire, quelle que soit sa nature.
 *
 * **Deux moitiés nommées, et non huit clés à plat.** Chacune appartient à un
 * Bounded Context distinct, et la structure le dit désormais : `aptitude` est
 * ce que décide l'entrée en relation, `classement` ce que décide l'adéquation.
 * À plat, rien ne distinguait `peutOperer` de `estNonAverti` — deux verdicts
 * rendus par deux contextes, sur deux questions sans rapport, que le premier
 * lecteur venu pouvait croire issus du même calcul.
 *
 * Les deux champs reprennent **tels quels** les types que les deux contextes
 * publient déjà — `AptitudeDuProfil` et `ClassementDuTitulaire`. Rien n'est
 * réécrit clé par clé ici : cette Query compose, elle ne traduit pas, et une
 * copie de champs aurait été une occasion de plus de perdre une valeur en
 * chemin (c'est exactement ce qui était arrivé à `patrimoineDeclare` sur
 * `profil_pp`).
 */
export interface EligibiliteDuTitulaire {
  investorId: number;
  /** La société au nom de laquelle vaut ce verdict ; `null` pour le titulaire. */
  societeId: string | null;
  /**
   * Ce souscripteur peut-il réaliser des opérations financières, et sinon
   * qu'est-ce qui l'en empêche ?
   *
   * Pour le titulaire, c'est son KYC. Pour une société, c'est le verdict
   * composé par `aptitudeDeLaSociete` — KYC du représentant, immatriculation,
   * bénéficiaires déclarés et dossier de pièces complet. Le contexte en aval
   * retient ce verdict, il ne rejoue pas la règle qui l'a produit.
   */
  aptitude: AptitudeDuProfil;
  /**
   * Jusqu'où il peut aller : catégorie PSFP, plafond conseillé, patrimoine
   * déclaré. Décidé par le questionnaire d'adéquation, jamais ici.
   */
  classement: ClassementDuTitulaire;
}

/**
 * Ce que les autres contextes lisent de l'éligibilité, sans en tenir l'agrégat.
 *
 * **Il compose deux contextes en une réponse.** L'aptitude à opérer est celle
 * de l'entrée en relation ; la catégorie et le plafond viennent de l'adéquation,
 * par son port. Les contextes financiers en aval posent la question d'un seul
 * tenant — « peut-il souscrire, et jusqu'où » — et la composer ici leur évite
 * d'en connaître deux pour une seule décision.
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
}
