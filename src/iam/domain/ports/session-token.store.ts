export const SESSION_TOKEN_STORE = Symbol('SESSION_TOKEN_STORE');

/**
 * Sessions ouvertes : un refresh token valide par compte.
 *
 * C'est ce qui rend une session révocable — un JWT signé ne peut pas être
 * repris, mais on peut refuser de le rafraîchir. `invalidate` est appelé à
 * chaque changement de mot de passe.
 */
export interface SessionTokenStore {
  remember(email: string, refreshTokenId: string): Promise<void>;
  isCurrent(email: string, refreshTokenId: string): Promise<boolean>;
  invalidate(email: string): Promise<void>;
}
