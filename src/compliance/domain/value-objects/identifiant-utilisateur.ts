import { ChampKycInvalideError } from '../errors/champ-kyc.errors';
import { ChampProfilInvalideError } from '../errors/champ-profil.errors';

/**
 * Compte auquel se rattache une pièce du dossier de conformité.
 *
 * Le rattachement au compte — clé primaire pour le profil moral, colonne
 * unique pour le profil physique, index pour le dossier de vérification. Une
 * valeur absente ou négative produirait une ligne orpheline, ou écraserait
 * celle d'un autre.
 *
 * La règle existait en **deux exemplaires** identiques, un par contexte : le
 * commentaire de la version KYC assumait explicitement la recopie plutôt qu'un
 * module partagé, « exactement le couplage que ce découpage supprime ». Les
 * deux contextes n'en font plus qu'un, l'argument tombe, la borne est ici.
 *
 * Deux fonctions et non une : le code d'erreur publié diffère selon la pièce
 * concernée — `CHAMP_KYC_INVALIDE` d'un côté, `CHAMP_PROFIL_INVALIDE` de
 * l'autre — et le front s'aligne dessus. C'est la **règle** qui était en
 * double, pas le contrat d'erreur.
 */
const estIdentifiantRecevable = (raw: number): boolean =>
  Number.isInteger(raw) && raw > 0;

const LIBELLE = "L'identifiant utilisateur";
const RAISON = 'doit être un entier positif.';

/**
 * Pour un profil personne physique ou morale, et le questionnaire.
 *
 * `champ` parce que les pièces du dossier ne nomment pas toutes ce
 * rattachement pareil : le profil physique publie `userId`, comme le reste de
 * l'API ; le profil moral et le questionnaire disent encore `utilisateurId`.
 * C'est le nom que le front surligne — il doit désigner un champ que la
 * réponse porte réellement.
 */
export function eprouverUtilisateurId(
  raw: number,
  champ = 'utilisateurId',
): number {
  if (!estIdentifiantRecevable(raw)) {
    throw new ChampProfilInvalideError(LIBELLE, RAISON, champ);
  }
  return raw;
}

/** Pour un dossier de vérification d'identité. */
export function eprouverUtilisateurIdDuDossierKyc(raw: number): number {
  if (!estIdentifiantRecevable(raw)) {
    throw new ChampKycInvalideError(LIBELLE, RAISON, 'utilisateurId');
  }
  return raw;
}
