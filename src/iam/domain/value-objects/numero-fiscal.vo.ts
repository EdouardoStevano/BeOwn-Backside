import { ChampProfilInvalideError } from 'src/iam/domain/errors';

/**
 * Bornes couvrant les NIF/TIN des juridictions rencontrées : 9 chiffres en
 * France (le « numéro fiscal de référence » en compte 13), 9 aux États-Unis,
 * jusqu'à une vingtaine de caractères ailleurs. Assez large pour ne refuser
 * personne, assez étroite pour écarter un champ rempli au hasard.
 */
const MIN_LENGTH = 5;
const MAX_LENGTH = 30;

/** Lettres, chiffres et tirets — aucun TIN n'utilise autre chose. */
const FORME = /^[A-Z0-9-]+$/;

const LABEL = "Le numéro d'identification fiscale";
const FIELD = 'nif';

/**
 * Numéro d'identification fiscale (NIF / TIN) du titulaire.
 *
 * Donnée déclarative destinée à l'échange automatique d'informations
 * (CRS / DAC2) : elle part vers l'administration telle qu'elle a été saisie.
 * Aucune vérification de clé de contrôle ici — chaque juridiction a la sienne,
 * et se tromper d'algorithme bloquerait un contribuable parfaitement en règle.
 * On écarte l'objectivement faux ; la conformité se prouve sur pièce.
 */
export class NumeroFiscal {
  private constructor(readonly value: string) {}

  /**
   * Espaces internes retirés, casse remontée : les administrations écrivent
   * ces numéros par groupes (« 12 34 56 789 ») et un même NIF stocké sous deux
   * formes compterait comme deux contribuables à l'export.
   */
  static of(raw: string | null | undefined): NumeroFiscal | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') {
      throw new ChampProfilInvalideError(LABEL, 'est invalide.', FIELD);
    }

    const normalized = raw.replace(/[\s.]/g, '').toUpperCase();
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
        'ne doit contenir que des lettres, des chiffres ou des tirets.',
        FIELD,
      );
    }

    return new NumeroFiscal(normalized);
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(raw: string | null): NumeroFiscal | null {
    return raw === null ? null : new NumeroFiscal(raw);
  }

  equals(other: NumeroFiscal | null | undefined): boolean {
    return other instanceof NumeroFiscal && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
