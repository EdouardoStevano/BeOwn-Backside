export const TOTP_GENERATOR = Symbol('TOTP_GENERATOR');

/** De quoi composer l'URI `otpauth://` que lira l'application authenticator. */
export interface TotpUriParams {
  /** Émetteur affiché dans l'application — décidé par `TotpSecretService`. */
  issuer: string;
  /** Compte affiché sous l'émetteur, en pratique l'adresse email. */
  label: string;
  secret: string;
  /**
   * URL publique du logo à afficher en vignette, si l'application la gère.
   *
   * `image` ne fait **pas** partie du Key Uri Format de Google : c'est une
   * extension de fait, honorée par 2FAS, Raivo et quelques autres, ignorée en
   * silence par celles qui ne la connaissent pas. Omise, l'URI reste
   * strictement conforme.
   */
  image?: string;
}

/**
 * Calcul RFC 6238, sans état côté serveur — **les trois primitives, rien de
 * plus**.
 *
 * Ce qui a quitté ce port : la résolution du nom d'application (`MFA_APP_NAME`
 * avec repli sur `TFA_APP_NAME`) et l'assemblage du couple `{ uri, secret }`
 * rendu à l'enrôlement. Ce ne sont pas des affaires de bibliothèque — remplacer
 * otplib par speakeasy n'y changerait pas une virgule — et les laisser ici
 * obligeait chaque implémentation à les recopier. Elles vivent désormais dans
 * `TotpSecretService`.
 *
 * `verify` retourne un `Promise<boolean>` et NON un `any` : l'ancienne
 * interface `OtpService.verifyTotp(): any` masquait le fait qu'otplib rend une
 * `Promise<VerifyResult>` (un objet `{ valid: boolean }`), que l'appelant
 * testait sans `await` — donc toujours vraie. N'importe quel code à 6 chiffres
 * validait `POST /otp/totp/verify`. Le type explicite rend ce contresens
 * impossible à réintroduire silencieusement.
 */
export interface TotpGenerator {
  /** Tire un secret partagé, en clair — à chiffrer avant persistance. */
  generateSecret(): string;
  /** Sérialise l'URI `otpauth://` à encoder en QR code. */
  buildUri(params: TotpUriParams): string;
  verify(otp: string, secret: string): Promise<boolean>;
}
