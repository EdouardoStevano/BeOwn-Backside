export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface TokenPayload {
  sub: number;
  email: string;
  role?: string;
  refreshTokenId?: string | null;
}

/** Le couple de tokens remis à un client authentifié. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface EmailTokenPayload {
  sub: number;
  email: string;
  emailTokenId: string;
}

/** Token de réinitialisation de mot de passe. Distinct de l'EmailTokenPayload :
 *  les deux sont signés avec le même secret, donc sans discriminant un lien de
 *  confirmation d'email pourrait servir à réinitialiser un mot de passe. */
export interface PasswordResetTokenPayload {
  sub: number;
  email: string;
  resetTokenId: string;
}

/**
 * Le jeton remis entre les deux étapes du sign-in : le mot de passe est validé,
 * le second facteur ne l'est pas encore. Il ne donne accès à rien d'autre qu'à
 * l'endpoint de vérification OTP.
 */
export interface TwoFactorChallengePayload {
  sub: number;
  email: string;
  challengeId: string;
}

/**
 * Discriminant du jeton de désinscription. Il doit rester valable très
 * longtemps (un email marketing s'archive), donc pas d'usage unique : c'est le
 * claim `type` qui empêche qu'un jeton de confirmation d'email soit rejoué sur
 * l'endpoint de désinscription, et réciproquement.
 */
export const NOTIF_UNSUBSCRIBE_TYPE = 'notif_unsubscribe';

export interface UnsubscribeTokenPayload {
  sub: number;
  type: typeof NOTIF_UNSUBSCRIBE_TYPE;
}

/**
 * Frappe et vérification des jetons. Le domaine ignore que ce sont des JWT :
 * il demande « un token de reset valable pour ce compte », pas « signe-moi
 * ceci en HS256 ».
 */
export interface TokenService {
  generateTokens(payload: TokenPayload): Promise<AuthTokens>;
  refreshTokens(token: string): Promise<AuthTokens>;
  verifyAccessToken(token: string): Promise<TokenPayload>;
  generateEmailToken(payload: EmailTokenPayload): Promise<string>;
  verifyEmailToken(token: string): Promise<EmailTokenPayload>;
  generatePasswordResetToken(
    payload: PasswordResetTokenPayload,
  ): Promise<string>;
  verifyPasswordResetToken(token: string): Promise<PasswordResetTokenPayload>;
  generateTwoFactorChallengeToken(
    payload: TwoFactorChallengePayload,
  ): Promise<string>;
  verifyTwoFactorChallengeToken(
    token: string,
  ): Promise<TwoFactorChallengePayload>;

  /**
   * Jeton longue durée (90 j) porté par le lien « se désinscrire » des
   * diffusions marketing.
   */
  generateUnsubscribeToken(userId: number): Promise<string>;
  /** Vérifie signature, émetteur et expiration. Le claim `type` est contrôlé par l'appelant. */
  verifyUnsubscribeToken(token: string): Promise<UnsubscribeTokenPayload>;
}
