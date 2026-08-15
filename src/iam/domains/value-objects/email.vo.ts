import { InvalidEmailError } from 'src/iam/domains/errors/profile.errors';

/** RFC 5321 : 254 caractères pour l'adresse complète. */
const MAX_LENGTH = 254;

/**
 * Forme minimale d'une adresse : quelque chose, un `@`, un domaine pointé.
 *
 * Volontairement permissif, dans le même esprit que `PersonName` : viser la
 * conformité RFC 5322 avec une expression régulière produit un monstre qui
 * refuse des adresses valides (guillemets, IDN, sous-adressage `+`). Seul
 * l'objectivement faux est écarté ; la preuve qu'une adresse existe reste la
 * vérification par lien, pas la syntaxe.
 */
const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adresse email — **rien que l'adresse**.
 *
 * Ce Value Object ne porte plus l'état de vérification : `isVerified` et
 * `verifiedDate` décrivent le cycle de vie du **compte**, pas la valeur de
 * l'adresse, et vivent donc dans l'agrégat `User`. Les loger ici rendait le VO
 * mutable — un comble pour un objet défini par sa valeur — et plaçait une
 * transition métier (`verify()`) hors de la racine censée la garder.
 *
 * Ce qui reste est le rôle propre d'un VO : normaliser et éprouver une chaîne
 * d'entrée, puis garantir qu'au-delà de `of()` plus aucune adresse invalide ne
 * circule dans le domaine.
 */
export class Email {
  private constructor(readonly value: string) {}

  /**
   * Point d'entrée validant : toute adresse **saisie** passe par ici
   * (inscription, OAuth, changement d'adresse).
   *
   * La normalisation précède le contrôle — une adresse tapée avec une
   * majuscule ou un espace de bordure est une faute de frappe, pas un refus,
   * et la stocker telle quelle ferait échouer la recherche par email, qui
   * compare en minuscules.
   */
  static of(raw: string): Email {
    if (typeof raw !== 'string') {
      throw new InvalidEmailError('est requise.');
    }

    const normalized = raw.trim().toLowerCase();

    if (normalized.length === 0) {
      throw new InvalidEmailError('est requise.');
    }
    if (normalized.length > MAX_LENGTH) {
      throw new InvalidEmailError(
        `ne peut pas dépasser ${MAX_LENGTH} caractères.`,
      );
    }
    if (!SHAPE.test(normalized)) {
      throw new InvalidEmailError("n'est pas une adresse valide.");
    }

    return new Email(normalized);
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle. Réservé aux mappers,
   * pour la même raison que `FirstName.restore` : une ligne écrite avant que la
   * règle n'existe doit rester lisible. Refuser au chargement rendrait un compte
   * inaccessible — y compris pour corriger l'adresse fautive.
   */
  static restore(raw: string): Email {
    return new Email(raw);
  }

  /** Égalité par valeur — un VO n'a pas d'identité. */
  equals(other: Email | null | undefined): boolean {
    return other instanceof Email && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
