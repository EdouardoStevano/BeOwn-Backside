/**
 * **L'investisseur, vu par la souscription** — sa seule facette réglementaire.
 *
 * `subscription` ne connaît ni `InvestorComplianceProfile` ni `ProfilPP` : il
 * consomme le verdict de `compliance`, en amont (§3.4, Customer/Supplier),
 * traduit par `EligibilitePsfpTranslator` (§13, §20).
 *
 * Deux règles seulement en dépendent, et les deux vivent dans
 * `InvestmentFactory` :
 *
 * - la **fenêtre de rétractation** de 4 jours, ouverte aux seuls non-avertis ;
 * - le **plafond conseillé** par la catégorie PSFP (art. 21), franchissable
 *   uniquement sur consentement explicite.
 *
 * Le plafond arrive déjà calculé : c'est `compliance` qui décide de sa formule
 * (max entre un plancher et 5 % du patrimoine déclaré — `plafondConseille()`
 * sur le profil), pas ce contexte. `null` signifie « le statut de cet
 * investisseur ne recommande aucun plafond » — un averti, un professionnel, ou
 * un profil dont la catégorisation reste à faire.
 */
export interface EligibilitePsfp {
  /** Catégorisation PSFP : ouvre le droit de rétractation de 4 jours. */
  estNonAverti: boolean;
  /** Plafond conseillé par investissement. `null` = aucun plafond recommandé. */
  plafondConseille: number | null;
  /** Patrimoine déclaré, repris tel quel dans le message d'avertissement. */
  patrimoineDeclare: number;
  /** Plancher réglementaire sous lequel le plafond conseillé ne descend pas. */
  plancherPlafond: number;
}
