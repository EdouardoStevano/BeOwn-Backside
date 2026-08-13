export const OTP_STORE = Symbol('OTP_STORE');

/**
 * Stockage des OTP à usage unique du parcours 2FA/connexion (canaux email et
 * SMS). Volontairement séparé de {@link TotpGenerator} (ISP, §4) : générer et
 * vérifier un code stocké côté serveur n'a rien à voir avec la vérification
 * d'un TOTP calculé côté client à partir d'un secret partagé — les deux
 * responsabilités vivaient auparavant dans la même interface `OtpService`,
 * ce qui forçait chaque implémentation à porter les deux.
 */
export interface OtpStore {
  generateOtp(key: string): Promise<string>;
  verifyOtp(key: string, otp: string): Promise<boolean>;
  hasActiveOtp(key: string): Promise<boolean>;
  invalidate(key: string): Promise<void>;
}
