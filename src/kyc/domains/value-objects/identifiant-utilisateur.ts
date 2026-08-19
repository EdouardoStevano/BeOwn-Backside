import { ChampKycInvalideError } from 'src/kyc/domains/errors';

/**
 * Compte auquel se rattache un dossier de vérification d'identité.
 *
 * `utilisateurId` porte le rattachement au compte (un index sur la table
 * `kyc`) : une valeur absente ou négative produirait un dossier orphelin, ou
 * écraserait celui d'un autre.
 *
 * Le contexte Profiles porte la même règle pour ses profils PP et PM. Vingt
 * lignes recopiées plutôt qu'un module partagé entre les deux contextes :
 * partager obligerait KYC à dépendre de Profiles pour une borne d'entier, et
 * c'est exactement le couplage que ce découpage supprime (§5 — CRP).
 *
 * Une fonction plutôt qu'un Value Object : rien n'est transporté, seule la
 * règle l'est, et l'entier reste un entier de part et d'autre.
 */
export function eprouverUtilisateurId(raw: number): number {
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new ChampKycInvalideError(
      "L'identifiant utilisateur",
      'doit être un entier positif.',
      'utilisateurId',
    );
  }
  return raw;
}
