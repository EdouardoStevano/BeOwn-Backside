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

export interface TokenService {
  generateTokens(payload: TokenPayload): Promise<AuthTokens>;
  refreshTokens(token: string): Promise<AuthTokens>;
  verifyAccessToken(token: string): Promise<TokenPayload>;
  generateEmailToken(payload: EmailTokenPayload): Promise<string>;
  verifyEmailToken(token: string): Promise<EmailTokenPayload>;
}
