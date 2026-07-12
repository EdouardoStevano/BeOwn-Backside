import { InvalidEmailError } from '../errors/user.errors';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adresse email d'un utilisateur, avec son état de vérification.
 *
 * Les champs restent publics : cet objet est sérialisé tel quel dans les
 * réponses HTTP (`{ email, isVerified, verifiedDate }`), et des accesseurs
 * privés changeraient la forme du JSON renvoyé au front.
 */
export class UserEmail {
  email: string;
  isVerified: boolean;
  verifiedDate: Date | null;

  private constructor(
    email: string,
    isVerified: boolean,
    verifiedDate: Date | null,
  ) {
    this.email = email;
    this.isVerified = isVerified;
    this.verifiedDate = verifiedDate;
  }

  /** Nouvelle adresse, non vérifiée. Normalise et valide le format. */
  static create(email: string): UserEmail {
    const normalized = email.toLowerCase().trim();
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new InvalidEmailError(email);
    }
    return new UserEmail(normalized, false, null);
  }

  /** Reconstitution depuis la persistance : aucune règle à rejouer. */
  static restore(
    email: string,
    isVerified: boolean,
    verifiedDate: Date | null,
  ): UserEmail {
    return new UserEmail(email, isVerified, verifiedDate);
  }

  verify(): void {
    if (this.isVerified) return;
    this.isVerified = true;
    this.verifiedDate = new Date();
  }

  equals(other: UserEmail): boolean {
    return this.email === other.email;
  }
}
