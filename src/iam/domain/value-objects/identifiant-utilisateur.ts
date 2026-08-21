import { ChampProfilInvalideError } from 'src/iam/domain/errors';

/**
 * Compte auquel se rattache un dossier du contexte Profiles.
 *
 * La règle vaut pour les trois agrégats — profil physique, profil moral,
 * dossier KYC — parce que la raison est la même : `utilisateurId` porte le
 * rattachement au compte (clé primaire pour les profils, index pour le KYC).
 * Une valeur absente ou négative produirait une ligne orpheline, ou écraserait
 * celle d'un autre.
 *
 * Elle était recopiée à l'identique dans `ProfilPPFactory` et `ProfilPMFactory` ;
 * l'ouverture du dossier KYC en demandait une troisième copie, et trois
 * exemplaires d'une même borne, c'est trois endroits à corriger le jour où elle
 * change. Une fonction plutôt qu'un Value Object : rien n'est transporté, seule
 * la règle est partagée, et l'entier reste un entier de part et d'autre.
 */
export function eprouverUtilisateurId(raw: number): number {
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new ChampProfilInvalideError(
      "L'identifiant utilisateur",
      'doit être un entier positif.',
      'utilisateurId',
    );
  }
  return raw;
}
