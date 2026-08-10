/**
 * Adresse email d'un compte, avec son état de vérification.
 *
 * État privé : `isVerified` ne peut être passé à `true` que par `verify()`.
 * Auparavant les trois champs étaient publics et mutables — n'importe quel
 * appelant pouvait écrire `user.userEmail.isVerified = true` et contourner la
 * vérification d'email, qui garde pourtant l'accès à la connexion.
 */
export class UserEmail {
  private _email: string;
  private _isVerified: boolean;
  private _verifiedDate: Date | null;

  constructor(email: string) {
    this._email = email.toLowerCase().trim();
    this._isVerified = false;
    this._verifiedDate = null;
  }

  /**
   * Reconstitue le VO depuis la persistance. Réservé aux mappers : c'est le
   * seul chemin qui permet de repartir d'un état déjà vérifié sans repasser
   * par `verify()`.
   */
  static restore(
    email: string,
    isVerified: boolean,
    verifiedDate: Date | null,
  ): UserEmail {
    const vo = new UserEmail(email);
    vo._isVerified = isVerified;
    vo._verifiedDate = verifiedDate;
    return vo;
  }

  get email(): string {
    return this._email;
  }

  get isVerified(): boolean {
    return this._isVerified;
  }

  get verifiedDate(): Date | null {
    return this._verifiedDate;
  }

  /** Idempotent : re-vérifier une adresse déjà vérifiée ne change pas la date. */
  verify(): void {
    if (this._isVerified) return;
    this._isVerified = true;
    this._verifiedDate = new Date();
  }

  /**
   * Sans ce `toJSON`, `res.json()` sérialiserait les champs privés tels quels
   * (`_email`, `_isVerified`…) et changerait le contrat d'API.
   */
  toJSON(): {
    email: string;
    isVerified: boolean;
    verifiedDate: Date | null;
  } {
    return {
      email: this._email,
      isVerified: this._isVerified,
      verifiedDate: this._verifiedDate,
    };
  }
}
