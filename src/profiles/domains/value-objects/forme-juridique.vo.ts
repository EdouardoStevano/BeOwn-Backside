import { ChampProfilInvalideError } from 'src/profiles/domains/errors';

const MIN_LENGTH = 2;
const MAX_LENGTH = 60;

/** Sigles et libellés : lettres, chiffres, espaces, points, tirets, apostrophes. */
const FORME = /^[A-ZÀ-ÖØ-Þ0-9 .'-]+$/;

const LABEL = 'La forme juridique';
const FIELD = 'formeJuridique';

/**
 * Forme juridique de la personne morale — « SAS », « SARL », « SCI »…
 *
 * **Pas une énumération.** La tentation est forte de fermer la liste, mais la
 * nomenclature INSEE des catégories juridiques en compte plusieurs centaines,
 * elle évolue par arrêté, et les sociétés étrangères en apportent d'autres
 * encore (« GmbH », « Ltd », « SA de droit luxembourgeois »). Une énumération
 * refuserait des sociétés parfaitement constituées à chaque forme oubliée,
 * pour un gain nul : rien dans le code ne branche sur cette valeur.
 *
 * Ce qui est normalisé, en revanche, c'est la **casse** : « sas », « Sas » et
 * « SAS » désignent la même chose, et les laisser coexister rend tout
 * regroupement — statistique, export réglementaire — faux sans prévenir.
 */
export class FormeJuridique {
  private constructor(readonly value: string) {}

  static of(raw: string | null | undefined): FormeJuridique | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') {
      throw new ChampProfilInvalideError(LABEL, 'est invalide.', FIELD);
    }

    const normalized = raw.trim().replace(/\s+/g, ' ').toUpperCase();
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
        'ne doit contenir que des lettres, des chiffres et la ponctuation usuelle des sigles.',
        FIELD,
      );
    }

    return new FormeJuridique(normalized);
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `Siren`). */
  static restore(raw: string | null): FormeJuridique | null {
    return raw === null ? null : new FormeJuridique(raw);
  }

  equals(other: FormeJuridique | null | undefined): boolean {
    return other instanceof FormeJuridique && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
