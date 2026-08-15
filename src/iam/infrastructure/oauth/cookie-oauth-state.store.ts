import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * OAuth state bound to the browser that initiated the flow. This avoids the
 * default in-memory Passport session store while remaining safe when the API
 * is scaled horizontally.
 */
export class CookieOAuthStateStore {
  private readonly secret =
    process.env.OAUTH_STATE_SECRET ?? process.env.JWT_SECRET ?? '';

  constructor(private readonly provider: string) {
    if (!this.secret) {
      throw new Error('OAUTH_STATE_SECRET must be configured for OAuth.');
    }
  }

  store(req: any, callback: (error: Error | null, state?: string) => void) {
    const issuedAt = Date.now().toString();
    const nonce = randomBytes(32).toString('base64url');
    const state = `${issuedAt}.${nonce}.${this.sign(issuedAt, nonce)}`;
    req.res?.cookie(this.cookieName, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: STATE_TTL_MS,
      path: '/auth',
    });
    callback(null, state);
  }

  verify(
    req: any,
    providedState: string,
    callback: (error: Error | null, valid: boolean, info?: unknown) => void,
  ) {
    const cookieState = this.readCookie(req.headers?.cookie);
    const parts = providedState?.split('.') ?? [];
    const issuedAt = Number(parts[0]);
    const nonce = parts[1];
    const signature = parts[2];
    const expected =
      nonce && parts.length === 3 ? this.sign(parts[0], nonce) : '';
    const valid =
      !!cookieState &&
      cookieState === providedState &&
      Number.isFinite(issuedAt) &&
      Date.now() - issuedAt <= STATE_TTL_MS &&
      !!signature &&
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

    req.res?.clearCookie(this.cookieName, { path: '/auth' });
    callback(
      null,
      valid,
      valid ? undefined : { message: 'Invalid OAuth state.' },
    );
  }

  private get cookieName() {
    return `beown_oauth_state_${this.provider}`;
  }

  private sign(issuedAt: string, nonce: string) {
    return createHmac('sha256', this.secret)
      .update(`${this.provider}.${issuedAt}.${nonce}`)
      .digest('base64url');
  }

  private readCookie(header?: string): string | undefined {
    return header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${this.cookieName}=`))
      ?.slice(this.cookieName.length + 1);
  }
}
