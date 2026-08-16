import { ChampProfilInvalideError } from 'src/profiles/domains/errors';

/** Âge minimal pour souscrire : la capacité juridique commence à 18 ans. */
export const AGE_MINIMUM = 18;

/**
 * Au-delà, la saisie est une faute de frappe, pas une longévité : la doyenne
 * de l'humanité a atteint 122 ans. Une année tapée à côté (1892 pour 1992)
 * passait jusqu'ici sans broncher et faussait tout contrôle d'âge.
 */
const AGE_MAXIMUM = 120;

/** Date civile pure, sans heure ni fuseau. */
const FORMAT_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const LABEL = 'La date de naissance';
const FIELD = 'dateNaissance';

/**
 * Date de naissance du titulaire du profil.
 *
 * **Une date civile, pas un instant.** Elle est portée en interne par la
 * chaîne `YYYY-MM-DD` et non par un `Date` : un `Date` est un instant UTC, et
 * `new Date('1985-06-15')` relu dans un fuseau à l'ouest redonne le 14 juin.
 * Le bug est silencieux, ne se manifeste qu'en production, et décale la date
 * de naissance d'un jour sur tous les documents réglementaires — dont le
 * dossier KYC, où elle doit correspondre au justificatif d'identité au jour
 * près. La colonne Postgres est de type `date`, donc sans fuseau elle non
 * plus : ce VO reste fidèle au type de la donnée d'un bout à l'autre.
 */
export class DateNaissance {
  private constructor(readonly value: string) {}

  /**
   * Accepte la chaîne ISO du DTO comme un `Date` déjà construit — un import ou
   * un script n'a pas de raison de repasser par une chaîne.
   */
  static of(raw: string | Date | null | undefined): DateNaissance | null {
    if (raw === null || raw === undefined) return null;

    const texte = raw instanceof Date ? DateNaissance.formatUtc(raw) : raw;

    if (typeof texte !== 'string') {
      throw new ChampProfilInvalideError(LABEL, 'est invalide.', FIELD);
    }

    const trimmed = texte.trim();
    if (trimmed.length === 0) return null;

    // Le DTO peut envoyer un ISO complet (`@IsDateString` l'accepte) : on ne
    // garde que la partie civile, l'heure n'a aucun sens pour une naissance.
    const jour = trimmed.slice(0, 10);
    const parts = FORMAT_ISO.exec(jour);
    if (!parts) {
      throw new ChampProfilInvalideError(
        LABEL,
        "doit être au format AAAA-MM-JJ (exemple : '1985-06-15').",
        FIELD,
      );
    }

    const annee = Number(parts[1]);
    const mois = Number(parts[2]);
    const jourDuMois = Number(parts[3]);

    // `Date.UTC` normalise silencieusement : le 31 février devient le 3 mars.
    // On compare donc la date reconstruite aux composants saisis, seul moyen
    // de distinguer une date inexistante d'une date valide.
    const instant = new Date(Date.UTC(annee, mois - 1, jourDuMois));
    const existe =
      instant.getUTCFullYear() === annee &&
      instant.getUTCMonth() === mois - 1 &&
      instant.getUTCDate() === jourDuMois;
    if (!existe) {
      throw new ChampProfilInvalideError(
        LABEL,
        'ne correspond à aucun jour du calendrier.',
        FIELD,
      );
    }

    const age = DateNaissance.ageAu(instant, new Date());

    if (age < 0) {
      throw new ChampProfilInvalideError(
        LABEL,
        'ne peut pas être dans le futur.',
        FIELD,
      );
    }
    if (age < AGE_MINIMUM) {
      throw new ChampProfilInvalideError(
        LABEL,
        `doit correspondre à un investisseur majeur (${AGE_MINIMUM} ans révolus).`,
        FIELD,
      );
    }
    if (age > AGE_MAXIMUM) {
      throw new ChampProfilInvalideError(
        LABEL,
        `ne peut pas correspondre à un âge supérieur à ${AGE_MAXIMUM} ans.`,
        FIELD,
      );
    }

    return new DateNaissance(jour);
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`).
   *
   * TypeORM rend une colonne `date` sous forme de chaîne `YYYY-MM-DD` malgré
   * le type `Date` déclaré sur l'entité ; les deux formes sont donc acceptées.
   */
  static restore(raw: string | Date | null): DateNaissance | null {
    if (raw === null || raw === undefined) return null;
    return new DateNaissance(
      raw instanceof Date
        ? DateNaissance.formatUtc(raw)
        : String(raw).slice(0, 10),
    );
  }

  /** Âge en années révolues, aujourd'hui. */
  age(): number {
    return DateNaissance.ageAu(
      new Date(`${this.value}T00:00:00.000Z`),
      new Date(),
    );
  }

  equals(other: DateNaissance | null | undefined): boolean {
    return other instanceof DateNaissance && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  /** Années révolues entre deux instants, en UTC de bout en bout. */
  private static ageAu(naissance: Date, reference: Date): number {
    let age = reference.getUTCFullYear() - naissance.getUTCFullYear();
    const moisEcoule = reference.getUTCMonth() - naissance.getUTCMonth();
    if (
      moisEcoule < 0 ||
      (moisEcoule === 0 && reference.getUTCDate() < naissance.getUTCDate())
    ) {
      age -= 1;
    }
    return age;
  }

  private static formatUtc(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
