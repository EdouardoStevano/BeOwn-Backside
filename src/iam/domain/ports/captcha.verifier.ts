export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');

/** Anti-robot à l'inscription. Le domaine ignore que c'est reCAPTCHA. */
export interface CaptchaVerifier {
  verify(token?: string): Promise<void>;
}
