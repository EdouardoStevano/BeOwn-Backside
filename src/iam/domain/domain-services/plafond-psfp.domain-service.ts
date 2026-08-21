/**
 * Plancher du plafond conseillé aux investisseurs non avertis : le règlement
 * PSFP autorise 1 000 € même quand 5 % du patrimoine déclaré est inférieur.
 */
export const PLANCHER_PLAFOND_NON_AVERTI = 1_000;

/** Part du patrimoine déclaré au-delà de laquelle l'investissement est déconseillé. */
export const PART_PATRIMOINE_CONSEILLEE = 0.05;

/**
 * Montant conseillé par investissement à un non-averti : le plus élevé du
 * plancher réglementaire et de 5 % du patrimoine déclaré.
 *
 * Une règle, un domicile. Elle était écrite deux fois : dans
 * `EvaluationInvestisseur.plafondConseille()`, qui la sert au contrôle de
 * plafond de `create-investment.usecase`, et dans `SaveQuestionnaireUseCase`,
 * qui calculait le montant **stocké** en base au moment du questionnaire. Les
 * deux versions divergeaient déjà d'un arrondi, si bien que le plafond affiché
 * au titulaire et celui réellement opposé à sa souscription n'étaient pas tout
 * à fait le même nombre. Une évolution réglementaire — le plancher passe à
 * 1 500 €, la part à 10 % — n'aurait été appliquée qu'à l'un des deux.
 *
 * L'arrondi à l'euro est conservé : c'est la forme sous laquelle le montant est
 * présenté au titulaire, et la colonne qui le stocke est un `decimal(14,2)`.
 *
 * Fonction pure dans `domain/services/` : elle n'appartient à aucune entité en
 * particulier — le questionnaire la lit au moment de classer, le profil au
 * moment de conseiller (§6 — Domain Service).
 */
export function plafondConseillePour(patrimoine: number | null): number {
  return Math.max(
    PLANCHER_PLAFOND_NON_AVERTI,
    Math.round((patrimoine ?? 0) * PART_PATRIMOINE_CONSEILLEE),
  );
}
