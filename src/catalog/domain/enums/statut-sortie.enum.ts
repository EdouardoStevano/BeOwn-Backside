/**
 * Cycle de vie d'une sortie (revente du bien détenu par la SCI).
 *
 * Vivait dans `domains/sortie-projet.ts`, au-dessus de l'agrégat : les trois
 * autres énumérations du contexte (`ProjectStatus`, `ModeleEconomique`,
 * `RegimeFiscal`) ont leur fichier sous `domains/enums/` (§10), celle-ci les
 * rejoint. Les valeurs sont inchangées — ce sont celles écrites en base.
 */
export enum StatutSortie {
  /** Vente envisagée mais non actée. */
  PROJETEE = 'projetee',
  /** Acte de vente signé, prix encaissé. */
  ACTEE = 'actee',
  /** Capital + plus-value versés aux investisseurs. Définitif. */
  DISTRIBUEE = 'distribuee',
  ANNULEE = 'annulee',
}
