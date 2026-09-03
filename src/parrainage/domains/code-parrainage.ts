import { randomInt } from 'node:crypto';

/**
 * Code de parrainage — règles de forme et génération.
 *
 * Domaine pur : la seule dépendance est le générateur d'aléa de la
 * bibliothèque standard, et il est injectable pour que les tests restent
 * déterministes (aucun framework, aucune persistance).
 *
 * FORME. `BEOWN-XXXXXX` — 12 caractères exactement, ce qui borne la colonne
 * `users.codeParrainage` (varchar(12)). Le préfixe rend le code
 * reconnaissable comme un code BeOwn dans un lien ou un message ; le suffixe
 * de 6 caractères est tiré d'un alphabet SANS caractères ambigus (ni I, L, O,
 * ni 0, 1) : ce code est destiné à être recopié à la main depuis un écran ou
 * dicté à voix haute — chaque confusion possible est un filleul perdu.
 *
 * ENTROPIE. 31^6 ≈ 887 millions de combinaisons : la collision est traitée
 * par retry sur la contrainte UNIQUE en base (voir
 * AssurerCodeParrainageService), pas par un alphabet plus long qui dégraderait
 * la lisibilité.
 */
export const PREFIXE_CODE_PARRAINAGE = 'BEOWN-';
export const LONGUEUR_SUFFIXE_CODE_PARRAINAGE = 6;
export const LONGUEUR_CODE_PARRAINAGE =
  PREFIXE_CODE_PARRAINAGE.length + LONGUEUR_SUFFIXE_CODE_PARRAINAGE; // 12

/** Alphabet sans ambigus : pas de I/L/O (confusion 1/0) ni de 0/1. */
export const ALPHABET_CODE_PARRAINAGE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const FORMAT_CODE = new RegExp(
  `^${PREFIXE_CODE_PARRAINAGE}[${ALPHABET_CODE_PARRAINAGE}]{${LONGUEUR_SUFFIXE_CODE_PARRAINAGE}}$`,
);

/** Tirage d'un indice entier dans `[0, max)` — injectable pour les tests. */
export type GenerateurIndice = (max: number) => number;

const indiceCrypto: GenerateurIndice = (max) => randomInt(max);

export function genererCodeParrainage(
  indice: GenerateurIndice = indiceCrypto,
): string {
  let suffixe = '';
  for (let i = 0; i < LONGUEUR_SUFFIXE_CODE_PARRAINAGE; i++) {
    suffixe += ALPHABET_CODE_PARRAINAGE[indice(ALPHABET_CODE_PARRAINAGE.length)];
  }
  return `${PREFIXE_CODE_PARRAINAGE}${suffixe}`;
}

/**
 * Normalise une saisie utilisateur avant recherche : espaces parasites et
 * casse. On ne « répare » rien de plus — un code méconnaissable est un code
 * inconnu, et un code inconnu est ignoré (jamais une erreur d'inscription).
 */
export function normaliserCodeParrainage(brut: string): string {
  return brut.trim().toUpperCase();
}

export function estFormatCodeParrainage(code: string): boolean {
  return FORMAT_CODE.test(code);
}
