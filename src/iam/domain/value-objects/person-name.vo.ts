import { InvalidPersonNameError } from 'src/iam/domain/errors/profile.errors';

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

/**
 * Socle des noms de personne : prénom et nom obéissent à la même règle, seul
 * leur libellé d'erreur et leur caractère obligatoire diffèrent.
 *
 * **Aucune liste de caractères autorisés.** La tentation est grande d'exiger
 * des lettres, mais « O'Brien », « Jean-Luc », « van der Berg », « 李 » et les
 * noms accentués sont légitimes ; un filtre trop zélé refuse des gens plutôt
 * que des données. On se limite donc à ce qui est objectivement faux : vide,
 * trop court, trop long.
 */
abstract class PersonName {
  protected constructor(readonly value: string) {}

  /** Égalité par valeur — un VO n'a pas d'identité. */
  equals(other: PersonName | null | undefined): boolean {
    return other instanceof PersonName && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  /**
   * Normalise et éprouve. Les espaces de bordure sont retirés avant contrôle :
   * « Jean » saisi avec un espace de trop est une faute de frappe, pas un
   * refus, et le stocker tel quel ferait échouer toute comparaison ultérieure.
   */
  protected static normalize(raw: string, field: string): string {
    if (typeof raw !== 'string') {
      throw new InvalidPersonNameError(field, 'est requis.');
    }

    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      throw new InvalidPersonNameError(field, 'est requis.');
    }
    if (trimmed.length < MIN_LENGTH) {
      throw new InvalidPersonNameError(
        field,
        `doit contenir au moins ${MIN_LENGTH} caractères.`,
      );
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new InvalidPersonNameError(
        field,
        `ne peut pas dépasser ${MAX_LENGTH} caractères.`,
      );
    }

    return trimmed;
  }
}

/** Prénom du titulaire du compte — toujours présent. */
export class FirstName extends PersonName {
  static of(raw: string): FirstName {
    return new FirstName(PersonName.normalize(raw, 'Le prénom'));
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle. Réservé aux mappers,
   * pour la même raison que `UserEmail.restore` : une ligne écrite avant que
   * la règle n'existe doit pouvoir être relue. Refuser au chargement rendrait
   * un compte inaccessible — y compris pour corriger son propre prénom.
   */
  static restore(raw: string): FirstName {
    return new FirstName(raw);
  }
}

/** Nom de famille — facultatif : tout le monde n'en fournit pas. */
export class LastName extends PersonName {
  /** `null` et chaîne vide sont deux façons de dire « pas de nom ». */
  static of(raw: string | null | undefined): LastName | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string' && raw.trim().length === 0) return null;

    return new LastName(PersonName.normalize(raw, 'Le nom'));
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `FirstName`). */
  static restore(raw: string | null): LastName | null {
    return raw === null ? null : new LastName(raw);
  }
}
