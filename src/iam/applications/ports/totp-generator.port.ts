export const TOTP_GENERATOR = Symbol('TOTP_GENERATOR');

export interface TotpSecret {
  /** URI `otpauth://` à encoder en QR code pour l'application authenticator. */
  uri: string;
  /** Secret partagé, en clair — à chiffrer avant persistance (cf. SecretCipher). */
  secret: string;
}

/**
 * Génération/vérification RFC 6238, sans état côté serveur.
 *
 * `verify` retourne un `Promise<boolean>` et NON un `any` : l'ancienne
 * interface `OtpService.verifyTotp(): any` masquait le fait qu'otplib rend une
 * `Promise<VerifyResult>` (un objet `{ valid: boolean }`), que l'appelant
 * testait sans `await` — donc toujours vraie. N'importe quel code à 6 chiffres
 * validait `POST /otp/totp/verify`. Le type explicite rend ce contresens
 * impossible à réintroduire silencieusement.
 */
export interface TotpGenerator {
  generateSecret(email: string): TotpSecret;
  verify(otp: string, secret: string): Promise<boolean>;
}
