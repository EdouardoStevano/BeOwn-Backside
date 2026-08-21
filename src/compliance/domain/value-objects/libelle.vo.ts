import { ChampProfilInvalideError } from 'src/compliance/domain/errors';

/**
 * Caractères de contrôle. Tabulations et sauts de ligne ont déjà été réduits à
 * l'espace par la normalisation ; ce qui reste n'apparaît jamais dans une
 * saisie humaine et signale un copier-coller douteux, ou une tentative
 * d'injection dans un export CSV ou un PDF réglementaire.
 */
function contientUnCaractereDeControle(texte: string): boolean {
  return [...texte].some((caractere) => {
    const code = caractere.codePointAt(0) as number;
    // C0 (0x00-0x1F), DEL (0x7F) et C1 (0x80-0x9F).
    return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
  });
}

/**
 * Texte libre d'une ligne : ville, lieu de naissance, profession, secteur
 * d'activité, ligne d'adresse.
 *
 * Le DTO n'exigeait qu'un `string`, sans borne : une réponse de 10 000
 * caractères était acceptée jusqu'à ce que Postgres la refuse — ou pire,
 * l'accepte, la colonne étant un `varchar` sans longueur. Ce VO pose la borne
 * une fois, là où toutes les entrées passent.
 *
 * La longueur maximale est paramétrable parce que ces champs n'ont pas la même
 * nature : une ligne d'adresse est plus longue qu'un nom de ville. Le reste de
 * la règle — trim, espaces internes réduits, pas de caractère de contrôle —
 * est commun, et c'est ce qui justifie un VO unique plutôt que cinq
 * quasi-copies.
 */
export class Libelle {
  private constructor(readonly value: string) {}

  /** `null` et chaîne vide disent tous deux « non renseigné ». */
  static of(
    raw: string | null | undefined,
    label: string,
    field: string,
    maxLength: number,
  ): Libelle | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') {
      throw new ChampProfilInvalideError(label, 'est invalide.', field);
    }

    const normalized = raw.trim().replace(/\s+/g, ' ');
    if (normalized.length === 0) return null;

    if (normalized.length > maxLength) {
      throw new ChampProfilInvalideError(
        label,
        `ne peut pas dépasser ${maxLength} caractères.`,
        field,
      );
    }
    if (contientUnCaractereDeControle(normalized)) {
      throw new ChampProfilInvalideError(
        label,
        'contient des caractères non imprimables.',
        field,
      );
    }

    return new Libelle(normalized);
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(raw: string | null): Libelle | null {
    return raw === null ? null : new Libelle(raw);
  }

  equals(other: Libelle | null | undefined): boolean {
    return other instanceof Libelle && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
