export const SECRET_CIPHER = Symbol('SECRET_CIPHER');

/**
 * Chiffrement symétrique réversible des secrets persistés (secret TOTP).
 * Distinct de `HashingService` (à sens unique, pour les mots de passe) : un
 * secret TOTP doit pouvoir être relu en clair pour vérifier un code.
 */
export interface SecretCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
