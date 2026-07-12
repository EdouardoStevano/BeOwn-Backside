import { OtpTarget } from '../value-objects/otp-target.vo';

export const OTP_SERVICE = Symbol('OTP_SERVICE');

/** Secret TOTP et son URI otpauth:// (à afficher en QR code). */
export interface TotpSecret {
  uri: string;
  secret: string;
}

/**
 * Génération et vérification des codes à usage unique.
 *
 * Le port raisonne sur une cible métier (OtpTarget : un email ou un téléphone),
 * pas sur une clé de cache — la stratégie de nommage des clés Redis est un
 * détail de l'adapter.
 */
export interface OtpService {
  generate(target: OtpTarget): Promise<string>;
  /** Consomme le code s'il est correct. Lève TooManyOtpAttemptsError au-delà du quota. */
  verify(target: OtpTarget, code: string): Promise<boolean>;
  hasActiveChallenge(target: OtpTarget): Promise<boolean>;
  invalidate(target: OtpTarget): Promise<void>;

  generateTotpSecret(email: string): TotpSecret;

  /**
   * Asynchrone à dessein : la vérification TOTP d'otplib l'est. L'ancienne
   * signature synchrone renvoyait la Promise sans l'attendre, et une Promise
   * étant toujours truthy, tout code était accepté.
   */
  verifyTotp(code: string, secret: string): Promise<boolean>;
}
