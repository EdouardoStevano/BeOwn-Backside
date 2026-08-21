export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

/**
 * Type claim porté par les refresh tokens. Access et refresh étaient
 * auparavant indiscernables (même secret, même audience, même issuer, seul
 * `refreshTokenId` les distinguait) : un refresh token présenté en
 * `Authorization: Bearer` passait donc `verifyAccessToken`, ce qui rendait la
 * révocation de session inopérante — l'invalidation Redis faite au reset de
 * mot de passe ne coupe que la rotation, pas l'usage direct du token.
 * Le claim rend les refresh tokens structurellement inacceptables comme
 * access tokens (`verifyAccessToken` rejette tout token typé).
 */
export const REFRESH_TOKEN_TYPE = 'refresh';

export interface TokenPayload {
  sub: number;
  email: string;
  role?: string;
  refreshTokenId: string | null;
  /** Présent uniquement sur les refresh tokens. Les access tokens n'en portent jamais. */
  type?: typeof REFRESH_TOKEN_TYPE;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Type claim des tokens « pré-authentifiés » émis par le sign-in d'un compte
 * dont la double authentification est active.
 *
 * Ils ne confèrent AUCUN droit : `verifyAccessToken` rejette tout token portant
 * un claim `type`, donc le JwtAuthGuard les refuse comme n'importe quel token
 * typé. Ils attestent uniquement que le mot de passe a déjà été validé, le
 * temps que l'utilisateur saisisse son code, et s'échangent contre de vrais
 * tokens via `POST /auth/2fa/verify`.
 *
 * Avant ce mécanisme, le sign-in délivrait directement un access token et la
 * 2FA n'était qu'un écran React masquant l'interface : le jeton était déjà
 * valide et l'API restait accessible sans jamais fournir de code.
 */
export const PRE_AUTH_TOKEN_TYPE = 'pre_auth';

export interface PreAuthTokenPayload {
  sub: number;
  email: string;
  type: typeof PRE_AUTH_TOKEN_TYPE;
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
  /**
   * Jeton court (5 min) attestant d'un mot de passe déjà validé, en attente du
   * second facteur. Ne donne accès à rien — voir PRE_AUTH_TOKEN_TYPE.
   */
  generatePreAuthToken(userId: number, email: string): Promise<string>;
  /** Rejette tout token dont le claim `type` n'est pas `pre_auth`. */
  verifyPreAuthToken(token: string): Promise<PreAuthTokenPayload>;
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
