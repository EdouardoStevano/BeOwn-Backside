/**
 * **Le projet, vu par la souscription** — et rien de plus.
 *
 * `subscription` ne connaît pas l'agrégat `Project` de `catalog` (§3.2 : deux
 * contextes ne partagent pas leurs entités). Il reçoit cette vue, traduite par
 * la couche application (`ProjetSouscriptibleTranslator`, §13) à partir des
 * faits que `catalog` publie en amont (§3.4, Customer/Supplier) : exactement
 * les champs dont les règles RG-INV ont besoin.
 *
 * Trois use cases relisaient jusqu'ici l'entité ORM du projet et recalculaient
 * chacun, à sa façon, le prix d'une fraction (`ticketMinimum`) et le nombre
 * total de fractions (`nbFractions ?? capitalCible / prixFraction`). Ces deux
 * dérivations vivent désormais dans le traducteur, en un seul endroit.
 *
 * `enCollecte` et `dejaFinance` sont deux booléens distincts plutôt qu'un
 * statut : « la collecte n'est pas ouverte » et « la cible est déjà atteinte »
 * sont deux refus différents, avec deux messages différents pour
 * l'investisseur — et c'est tout ce que ce contexte a besoin de savoir du
 * cycle de vie de `catalog`.
 */
export interface ProjetSouscriptible {
  projetId: string;
  /** Le projet est PUBLIÉ et sa collecte est ouverte (RG-INV). */
  enCollecte: boolean;
  /** La cible de collecte est atteinte — refus au message distinct. */
  dejaFinance: boolean;
  /** Nature du titre émis, reportée sur l'investissement. */
  instrument: string;
  /** Prix d'une fraction : le ticket plancher du projet (RG-INV-02). */
  prixFraction: number;
  /** Nombre total de fractions émises par le projet. */
  nbFractionsTotal: number;
  /** RG-INV-03. `null` = pas de plafond de ticket configuré. */
  ticketMaximum: number | null;
  /** TRI cible annuel, en pourcentage — base du calcul des coupons. */
  triCible: number;
  /** Durée de l'emprunt obligataire, en mois. */
  dureeMois: number;
}
