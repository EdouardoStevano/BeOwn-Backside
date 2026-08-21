import { ChampProfilInvalideError } from 'src/compliance/domain/errors';
import { CodePays } from './code-pays.vo';

const MIN_LENGTH = 2;
const MAX_LENGTH = 12;

/** Seuls caractères qu'un plan d'adressage utilise réellement. */
const FORME = /^[A-Z0-9][A-Z0-9 -]*$/;

const LABEL = 'Le code postal';
const FIELD = 'codePostal';

/**
 * Formats nationaux dont la règle est stable et sans ambiguïté.
 *
 * Table volontairement courte : chaque entrée est une promesse qu'on refusera
 * une saisie, et se tromper coûte un utilisateur bloqué à l'inscription. Les
 * pays absents ne subissent que le contrôle de forme générique — c'est le cas
 * de la Côte d'Ivoire, qui fonctionne par boîte postale, ou du Royaume-Uni,
 * dont le format demanderait à lui seul une demi-douzaine d'expressions.
 */
const FORMATS_NATIONAUX: ReadonlyMap<
  string,
  { regex: RegExp; attendu: string }
> = new Map([
  // Métropole, DOM et Monaco partagent le plan français à 5 chiffres.
  ['FR', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['MC', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['GP', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['MQ', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['GF', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['RE', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['YT', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['DE', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['ES', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['IT', { regex: /^\d{5}$/, attendu: '5 chiffres' }],
  ['US', { regex: /^\d{5}(-\d{4})?$/, attendu: '5 chiffres (ou 5-4)' }],
  ['BE', { regex: /^\d{4}$/, attendu: '4 chiffres' }],
  ['CH', { regex: /^\d{4}$/, attendu: '4 chiffres' }],
  ['LU', { regex: /^\d{4}$/, attendu: '4 chiffres' }],
  ['AT', { regex: /^\d{4}$/, attendu: '4 chiffres' }],
  ['PT', { regex: /^\d{4}-\d{3}$/, attendu: 'la forme 1234-567' }],
  ['NL', { regex: /^\d{4} ?[A-Z]{2}$/, attendu: 'la forme 1234 AB' }],
  ['CA', { regex: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/, attendu: 'la forme A1A 1A1' }],
]);

/**
 * Code postal du domicile.
 *
 * Validé en deux temps, parce que la règle dépend d'un autre champ : la forme
 * générique à la construction, puis la conformité au pays de résidence dans
 * l'invariant d'agrégat (`ProfilPP`). Un VO ne peut pas se valider seul ici —
 * « 1000 » est un code belge parfaitement valide et un code français
 * parfaitement faux, et le pays peut arriver dans la même requête ou dans une
 * mise à jour ultérieure.
 */
export class CodePostal {
  private constructor(readonly value: string) {}

  static of(raw: string | null | undefined): CodePostal | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') {
      throw new ChampProfilInvalideError(LABEL, 'est invalide.', FIELD);
    }

    // Casse et espaces multiples normalisés : « 1234  ab » est un code
    // néerlandais correct mal tapé, pas un code invalide.
    const normalized = raw.trim().toUpperCase().replace(/\s+/g, ' ');
    if (normalized.length === 0) return null;

    if (normalized.length < MIN_LENGTH || normalized.length > MAX_LENGTH) {
      throw new ChampProfilInvalideError(
        LABEL,
        `doit contenir entre ${MIN_LENGTH} et ${MAX_LENGTH} caractères.`,
        FIELD,
      );
    }
    if (!FORME.test(normalized)) {
      throw new ChampProfilInvalideError(
        LABEL,
        'ne doit contenir que des lettres, des chiffres, des espaces ou des tirets.',
        FIELD,
      );
    }

    return new CodePostal(normalized);
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(raw: string | null): CodePostal | null {
    return raw === null ? null : new CodePostal(raw);
  }

  /**
   * Vérifie la conformité au plan de numérotation du pays.
   *
   * Rend `true` pour tout pays absent de la table : ne rien savoir d'un format
   * n'autorise pas à refuser la saisie.
   */
  estConformeA(pays: CodePays): boolean {
    const format = FORMATS_NATIONAUX.get(pays.value);
    return format ? format.regex.test(this.value) : true;
  }

  /** Forme attendue par le pays, pour le message d'erreur. `null` si inconnue. */
  static formatAttendu(pays: CodePays): string | null {
    return FORMATS_NATIONAUX.get(pays.value)?.attendu ?? null;
  }

  equals(other: CodePostal | null | undefined): boolean {
    return other instanceof CodePostal && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
