/**
 * Screening de la liste interne de gel des avoirs — logique de correspondance
 * PURE : aucune dépendance framework, base ou réseau. Testée seule
 * (`sanctions-screening.spec.ts`).
 *
 * Règle de correspondance (mission 4, lot 2) :
 *  - normalisation de la casse et des accents des noms ;
 *  - correspondance si (nom + prénom exacts) OU (nom + date de naissance).
 *
 * Une correspondance est un SIGNAL destiné à l'équipe compliance, jamais une
 * décision : le gel d'un compte est un acte humain (endpoint admin dédié).
 */

/** Personne inscrite sur la liste interne de gel (extrait minimal). */
export interface PersonneGeleeRef {
  id: string;
  nom: string;
  prenom: string;
  /** ISO `yyyy-mm-dd`, ou null si inconnue de la liste. */
  dateNaissance: string | null;
}

/** Identité d'un utilisateur soumise au contrôle. */
export interface IdentiteControlee {
  nom: string | null | undefined;
  prenom: string | null | undefined;
  /** ISO `yyyy-mm-dd`, ou null si inconnue. */
  dateNaissance: string | null | undefined;
}

/**
 * Normalise un nom propre pour comparaison : minuscules, accents retirés
 * (décomposition Unicode NFD), tirets et apostrophes traités comme des
 * espaces, espaces répétés réduits. « Aïssatou  FALL » ≡ « aissatou fall »,
 * « Jean-Pierre » ≡ « Jean Pierre ».
 */
export function normaliserNom(valeur: string | null | undefined): string {
  if (!valeur) return '';
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalise une date en `yyyy-mm-dd` (les dates arrivent tantôt en `Date`,
 * tantôt en chaîne selon le driver). Retourne null si inexploitable — une
 * date absente ne matche jamais.
 */
export function normaliserDate(
  valeur: string | Date | null | undefined,
): string | null {
  if (!valeur) return null;
  if (valeur instanceof Date) {
    return isNaN(valeur.getTime()) ? null : valeur.toISOString().slice(0, 10);
  }
  const texte = String(valeur).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texte) ? texte : null;
}

/**
 * Vrai si l'identité contrôlée correspond à une personne de la liste :
 * nom identique ET (prénom identique OU date de naissance identique).
 * Un nom vide (des deux côtés ou d'un seul) ne matche jamais — la liste
 * ne doit pas se déclencher sur du bruit.
 */
export function estCorrespondance(
  identite: IdentiteControlee,
  personne: Pick<PersonneGeleeRef, 'nom' | 'prenom' | 'dateNaissance'>,
): boolean {
  const nom = normaliserNom(identite.nom);
  const nomListe = normaliserNom(personne.nom);
  if (!nom || !nomListe || nom !== nomListe) return false;

  const prenom = normaliserNom(identite.prenom);
  const prenomListe = normaliserNom(personne.prenom);
  if (prenom && prenomListe && prenom === prenomListe) return true;

  const date = normaliserDate(identite.dateNaissance);
  const dateListe = normaliserDate(personne.dateNaissance);
  return date != null && dateListe != null && date === dateListe;
}

/** Personnes de la liste correspondant à l'identité contrôlée. */
export function chercherCorrespondances(
  identite: IdentiteControlee,
  liste: readonly PersonneGeleeRef[],
): PersonneGeleeRef[] {
  return liste.filter((p) => estCorrespondance(identite, p));
}
