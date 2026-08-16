import { ChampProfilInvalideError } from 'src/profiles/domains/errors';

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

/**
 * Nom ou prénom porté par le profil personne physique.
 *
 * **Aucune liste de caractères autorisés.** La tentation est grande d'exiger
 * des lettres, mais « O'Brien », « Jean-Luc », « van der Berg », « 李 » et les
 * noms accentués sont légitimes ; un filtre trop zélé refuse des gens plutôt
 * que des données. On se limite à ce qui est objectivement faux : vide, trop
 * court, trop long.
 *
 * Le contexte IAM porte un VO jumeau pour le compte utilisateur. Les garder
 * séparés est délibéré (§5 — CRP) : rien ne garantit que la règle sur un nom
 * de connexion et celle sur un nom d'état civil resteront identiques, et le
 * profil ne doit pas dépendre du modèle d'un autre Bounded Context.
 */
export class NomPersonne {
  private constructor(readonly value: string) {}

  /**
   * Normalise et éprouve. Les espaces de bordure sont retirés avant contrôle :
   * un nom saisi avec un espace de trop est une faute de frappe, pas un refus,
   * et le stocker tel quel ferait échouer toute comparaison ultérieure — dont
   * le rapprochement avec la pièce d'identité au moment du KYC.
   */
  static of(
    raw: string | null | undefined,
    label: string,
    field: string,
  ): NomPersonne | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') {
      throw new ChampProfilInvalideError(label, 'est invalide.', field);
    }

    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (trimmed.length === 0) return null;

    if (trimmed.length < MIN_LENGTH) {
      throw new ChampProfilInvalideError(
        label,
        `doit contenir au moins ${MIN_LENGTH} caractères.`,
        field,
      );
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new ChampProfilInvalideError(
        label,
        `ne peut pas dépasser ${MAX_LENGTH} caractères.`,
        field,
      );
    }

    return new NomPersonne(trimmed);
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(raw: string | null): NomPersonne | null {
    return raw === null ? null : new NomPersonne(raw);
  }

  /**
   * Fabrique une valeur sans la soumettre au contrôle. Réservé au marqueur
   * d'identité manquante (`ProfilPP`), qui est plus court que le minimum exigé.
   */
  static marqueur(valeur: string): NomPersonne {
    return new NomPersonne(valeur);
  }

  equals(other: NomPersonne | null | undefined): boolean {
    return other instanceof NomPersonne && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
