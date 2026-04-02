export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface TokenPayload {
  sub: number;
  email: string;
  refreshTokenId: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenService {
  generateTokens(payload: TokenPayload): Promise<AuthTokens>;
  refreshTokens(token: string): Promise<AuthTokens>;
  verifyAccessToken(token: string): Promise<TokenPayload>;
}
