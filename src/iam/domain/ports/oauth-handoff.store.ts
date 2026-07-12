import { AuthTokens } from './token.service';

export const OAUTH_HANDOFF_STORE = Symbol('OAUTH_HANDOFF_STORE');

/**
 * Remise des tokens après un retour OAuth.
 *
 * Le fournisseur nous ramène sur une URL de redirection : y mettre les tokens
 * les exposerait dans l'historique du navigateur et les logs. On y met donc un
 * code éphémère à usage unique, que le front échange contre les tokens.
 */
export interface OAuthHandoffStore {
  storeCode(code: string, tokens: AuthTokens): Promise<void>;
  consumeCode(code: string): Promise<AuthTokens | null>;
}
