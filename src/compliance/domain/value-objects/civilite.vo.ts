import { ChampProfilInvalideError } from 'src/compliance/domain/errors';

const LABEL = 'La civilité';
const FIELD = 'civilite';

/**
 * Civilité retenue sur les documents réglementaires.
 *
 * Un ensemble fermé, donc une énumération plutôt qu'un Value Object : il n'y a
 * rien à normaliser ni à comparer au-delà de l'égalité de référence que
 * TypeScript donne déjà. Les valeurs sont celles déjà écrites en base et
 * attendues par le front — les changer imposerait une migration pour un gain
 * nul.
 */
export enum Civilite {
  MONSIEUR = 'M.',
  MADAME = 'Mme',
}

/**
 * Écritures acceptées à la saisie, une fois la casse et la ponctuation
 * retirées. Le champ était un `string` libre : « M », « Monsieur », « mr » et
 * « M. » coexistaient en base pour désigner la même chose, et tout regroupement
 * (publipostage, export réglementaire) devait les rattraper après coup.
 */
const SAISIES_CONNUES: ReadonlyMap<string, Civilite> = new Map([
  ['m', Civilite.MONSIEUR],
  ['mr', Civilite.MONSIEUR],
  ['monsieur', Civilite.MONSIEUR],
  ['mme', Civilite.MADAME],
  ['madame', Civilite.MADAME],
  ['mrs', Civilite.MADAME],
  ['ms', Civilite.MADAME],
]);

/**
 * Éprouve une civilité saisie. `null` et chaîne vide disent « non renseignée » :
 * le formulaire de complétion est progressif, et la civilité n'est exigée par
 * aucun texte.
 */
export function parseCivilite(raw: string | null | undefined): Civilite | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') {
    throw new ChampProfilInvalideError(LABEL, 'est invalide.', FIELD);
  }

  const cle = raw.trim().toLowerCase().replace(/[.\s]/g, '');
  if (cle.length === 0) return null;

  const civilite = SAISIES_CONNUES.get(cle);
  if (!civilite) {
    throw new ChampProfilInvalideError(
      LABEL,
      `doit valoir '${Civilite.MONSIEUR}' ou '${Civilite.MADAME}'.`,
      FIELD,
    );
  }

  return civilite;
}

/**
 * Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). La
 * valeur relue peut être une variante écrite avant que la règle n'existe ;
 * elle ressort telle quelle plutôt que de rendre le profil illisible.
 */
export function restoreCivilite(raw: string | null): Civilite | null {
  return raw === null ? null : (raw as Civilite);
}
