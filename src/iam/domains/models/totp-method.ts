/**
 * Méthode TOTP enrôlée par un utilisateur, vue depuis le domaine — distincte
 * de `TOTPMethodEntity` (mapping TypeORM), cf. §12.7. Le secret reste ici sous
 * sa forme chiffrée : seul le use case, via `SecretCipher`, le déchiffre le
 * temps d'une vérification.
 */
export interface TotpMethod {
  id: number;
  isActive: boolean;
  encryptedSecret: string;
}
