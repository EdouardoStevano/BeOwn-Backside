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

export interface TokenService {
  generateTokens(payload: TokenPayload): Promise<AuthTokens>;
  refreshTokens(token: string): Promise<AuthTokens>;
  verifyAccessToken(token: string): Promise<TokenPayload>;
  generateEmailToken(
    payload: Omit<EmailTokenPayload, 'type'>,
    purpose: EmailTokenPurpose,
  ): Promise<string>;
  verifyEmailToken(token: string): Promise<EmailTokenPayload>;
}
