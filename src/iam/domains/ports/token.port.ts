import { PublicUser } from 'src/iam/domains/models/user';
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface TokenPayload {
  sub: number;
  email: string;
  role?: string;
  refreshTokenId: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Ce que renvoie une **ouverture de session** : les tokens et l'état du compte.
 * Forme commune au sign-in et au rafraîchissement, pour que le front traite les
 * deux réponses avec le même code.
 *
 * Distinct d'`AuthTokens`, qui reste le couple de tokens nu : c'est ce que
 * produit `TokenService`, dont le rôle s'arrête aux identifiants — la relecture
 * du compte appartient au use case, qui seul connaît le repository.
 *
 * `user` est typé `PublicUser` (et non `User`) : le domaine décide de ce qui
 * est publiable, et l'empreinte du mot de passe n'y figure pas.
 */
export interface AuthSession extends AuthTokens {
  user: PublicUser;
}

/**
 * Purpose claim carried by every email token. Email-verification and
 * password-reset tokens used to be generated/verified through the exact
 * same JWT (no claim distinguishing them), so a verification token — which
 * travels in a GET URL and ends up in server/proxy logs and browser
 * history — could be replayed against the reset-password endpoint and used
 * to take over the account. Each issue site now stamps its purpose and
 * each verify site rejects a mismatch.
 */
export type EmailTokenPurpose = 'email_verify' | 'password_reset';

export interface EmailTokenPayload {
  sub: number;
  email: string;
  emailTokenId: string;
  type: EmailTokenPurpose;
}

/**
 * Type claim des tokens de désinscription marketing. Distinct des purposes
 * email (`email_verify` / `password_reset`) : ces derniers sont à usage
 * unique (Redis) et à TTL court, alors qu'un lien de désinscription doit
 * rester valable longtemps dans un email archivé — donc pas de single-use.
 * Le claim `type` empêche qu'un token de vérification d'email soit rejoué
 * sur l'endpoint de désinscription (et inversement).
 */
export const NOTIF_UNSUBSCRIBE_TYPE = 'notif_unsubscribe';

export interface UnsubscribeTokenPayload {
  sub: number;
  type: typeof NOTIF_UNSUBSCRIBE_TYPE;
}

export interface TokenService {
  generateTokens(payload: TokenPayload): Promise<AuthTokens>;
  refreshTokens(token: string): Promise<AuthTokens>;
  verifyAccessToken(token: string): Promise<TokenPayload>;
  generateEmailToken(
    payload: Omit<EmailTokenPayload, 'type'>,
    purpose: EmailTokenPurpose,
  ): Promise<string>;
  verifyEmailToken(token: string): Promise<EmailTokenPayload>;
  /**
   * Token longue durée (90 j) porté par le lien « se désinscrire » des
   * diffusions marketing. Appelé par le service de diffusion pour construire
   * `${FRONTEND_URL}/desinscription?token=...`.
   */
  generateUnsubscribeToken(userId: number): Promise<string>;
  /** Vérifie signature/émetteur/expiration. Le contrôle du claim `type` est fait par l'appelant. */
  verifyUnsubscribeToken(token: string): Promise<UnsubscribeTokenPayload>;
}
