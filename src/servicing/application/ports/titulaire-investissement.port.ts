export const TITULAIRE_INVESTISSEMENT_PORT = Symbol(
  'TITULAIRE_INVESTISSEMENT_PORT',
);

/**
 * Anti-Corruption Layer vers `subscription` (§20, §33).
 *
 * Servir un échéancier suppose de savoir à qui il appartient — c'est la seule
 * chose que ce contexte a besoin de savoir d'un investissement. Le port le dit
 * ainsi, et son adaptateur va la chercher ; le domaine de `servicing` ne voit
 * jamais l'agrégat `Investment`, ses statuts ni son montant.
 *
 * C'est le port qui définit le besoin, pas l'amont qui impose son modèle : la
 * réponse est un identifiant de compte, pas un investissement.
 */
export interface TitulaireInvestissementPort {
  /**
   * L'identifiant du compte titulaire de cet investissement, ou `null` si
   * l'investissement n'existe pas.
   */
  titulaireDe(investissementId: string): Promise<number | null>;
}
