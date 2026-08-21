export const SESSION_STORE = Symbol('SESSION_STORE');

/**
 * Une session ouverte : le droit, pour **un appareil**, de renouveler ses
 * tokens jusqu'à l'échéance.
 */
export interface SessionRefresh {
  utilisateurId: number;
  /** Identifiant de rotation porté par le refresh token lui-même. */
  refreshTokenId: string;
  expireLe: Date;
}

/**
 * Stockage des sessions de rafraîchissement.
 *
 * **Une entrée par session, et non par compte.** Le cache gardait
 * `refresh-<email>` : une seule valeur, écrasée à chaque connexion. Se
 * connecter sur son téléphone évinçait donc silencieusement la session du
 * navigateur, qui tombait à l'expiration de son access token sans que rien ne
 * l'ait annoncé. La clé porte désormais le couple compte + identifiant de
 * rotation, ce qui autorise autant d'appareils que le titulaire en ouvre.
 *
 * Le port ne dit rien du support : c'est délibéré, puisqu'il en existe deux —
 * un cache volatil et une table — et un proxy qui les compose (§9).
 */
export interface SessionStore {
  /** Ouvre ou prolonge une session. Les autres sessions ne sont pas touchées. */
  enregistrer(session: SessionRefresh): Promise<void>;

  /**
   * La session est-elle encore ouverte ? `false` si elle a été révoquée, si
   * elle a expiré, ou si elle n'a jamais existé — l'appelant n'a pas à faire
   * la différence, les trois refusent le renouvellement.
   */
  estValide(utilisateurId: number, refreshTokenId: string): Promise<boolean>;

  /**
   * Ferme **une** session : la rotation du refresh token, qui retire l'ancien
   * identifiant en émettant le nouveau. Les autres appareils continuent.
   */
  revoquer(utilisateurId: number, refreshTokenId: string): Promise<void>;

  /**
   * Ferme **toutes** les sessions du compte — changement de mot de passe,
   * suspension, déconnexion globale demandée par le titulaire.
   *
   * Sans multi-appareil, `invalidateRefreshTokenId(email)` suffisait puisqu'il
   * n'y avait qu'une session à retirer. Il en faut désormais une opération
   * explicite : oublier d'en fermer une laisserait un appareil connecté après
   * une réinitialisation de mot de passe.
   */
  revoquerToutes(utilisateurId: number): Promise<void>;
}
