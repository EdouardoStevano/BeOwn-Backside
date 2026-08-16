import { ChampProfilInvalideError } from 'src/profiles/domains/errors';

const MIN_LENGTH = 2;

/** Le RNE plafonne la dénomination sociale à cet ordre de grandeur. */
const MAX_LENGTH = 200;

const LABEL = 'La raison sociale';
const FIELD = 'raisonSociale';

/**
 * Dénomination sociale de la personne morale.
 *
 * **Aucune liste de caractères autorisés**, pour la même raison qu'un nom de
 * personne : « L'Oréal », « Saint-Gobain », « 3M France », « Carrefour & Cie »
 * ou « Établissements Müller » sont tous légitimes. Un filtre trop zélé refuse
 * des entreprises plutôt que des données. On écarte l'objectivement faux :
 * vide, trop court, trop long.
 *
 * Contrairement au reste du profil moral, ce champ est **obligatoire** — la
 * colonne est NOT NULL, et un profil sans dénomination ne désigne personne.
 */
export class RaisonSociale {
  private constructor(readonly value: string) {}

  /**
   * Normalise et éprouve. Les espaces de bordure sont retirés et les espaces
   * internes réduits : une dénomination saisie avec un espace de trop est une
   * faute de frappe, pas un refus, et la stocker telle quelle ferait échouer
   * tout rapprochement avec l'extrait Kbis.
   */
  static of(raw: string | null | undefined): RaisonSociale {
    if (typeof raw !== 'string') {
      throw new ChampProfilInvalideError(LABEL, 'est requise.', FIELD);
    }

    const normalized = raw.trim().replace(/\s+/g, ' ');

    if (normalized.length === 0) {
      throw new ChampProfilInvalideError(LABEL, 'est requise.', FIELD);
    }
    if (normalized.length < MIN_LENGTH) {
      throw new ChampProfilInvalideError(
        LABEL,
        `doit contenir au moins ${MIN_LENGTH} caractères.`,
        FIELD,
      );
    }
    if (normalized.length > MAX_LENGTH) {
      throw new ChampProfilInvalideError(
        LABEL,
        `ne peut pas dépasser ${MAX_LENGTH} caractères.`,
        FIELD,
      );
    }

    return new RaisonSociale(normalized);
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `Siren`). */
  static restore(raw: string): RaisonSociale {
    return new RaisonSociale(raw);
  }

  equals(other: RaisonSociale | null | undefined): boolean {
    return other instanceof RaisonSociale && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
