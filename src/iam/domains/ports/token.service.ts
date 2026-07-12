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

export interface TokenService {
  generateTokens(payload: TokenPayload): Promise<AuthTokens>;
  refreshTokens(token: string): Promise<AuthTokens>;
  verifyAccessToken(token: string): Promise<TokenPayload>;
  generateEmailToken(payload: EmailTokenPayload): Promise<string>;
  verifyEmailToken(token: string): Promise<EmailTokenPayload>;
  generatePasswordResetToken(payload: PasswordResetTokenPayload): Promise<string>;
  verifyPasswordResetToken(token: string): Promise<PasswordResetTokenPayload>;
}
