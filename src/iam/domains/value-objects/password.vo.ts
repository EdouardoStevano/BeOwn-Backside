import { WeakPasswordError } from 'src/iam/domains/errors/profile.errors';

/** Longueur minimale d'un mot de passe acceptable. */
const MIN_LENGTH = 8;

/**
 * Au-delà, ce n'est plus un mot de passe mais une charge : bcrypt tronque au
 * 72e octet, et accepter sans borne ouvre un déni de service par hachage de
 * chaînes énormes.
 */
const MAX_LENGTH = 72;

/** Une minuscule, une majuscule, un chiffre — la politique en vigueur. */
const COMPOSITION = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

/**
 * Mot de passe **en clair**, le temps d'être éprouvé puis haché.
 *
 * Il ne vit jamais dans `User` : l'entité ne connaît que l'empreinte. Ce VO
 * existe pour que la politique de mot de passe soit écrite à un seul endroit —
 * elle l'était en double dans `SignUpDto` et `ResetPasswordDto`, et rien ne
 * garantissait qu'un troisième point d'entrée (import, back-office, script) y
 * soit soumis. Un mot de passe qui atteint `HashingService` est désormais un
 * mot de passe déjà validé.
 *
 * La validation reste **aussi** dans les DTO : c'est elle qui produit un 400
 * lisible et documente Swagger. Ce VO est le filet, pas le portier.
 */
export class Password {
  private constructor(private readonly _value: string) {}

  /**
   * Le mot de passe n'est **pas** normalisé (ni trim, ni casse) : contrairement
   * à une adresse email, tout caractère saisi en fait partie. Le rogner
   * empêcherait de se reconnecter avec ce qu'on a réellement tapé.
   */
  static of(raw: string): Password {
    if (typeof raw !== 'string') throw new WeakPasswordError();
    if (raw.length < MIN_LENGTH || raw.length > MAX_LENGTH) {
      throw new WeakPasswordError();
    }
    if (!COMPOSITION.test(raw)) throw new WeakPasswordError();

    return new Password(raw);
  }

  /** Seul accès à la valeur : destiné au port de hachage, à rien d'autre. */
  get value(): string {
    return this._value;
  }

  /**
   * Deux garde-fous contre la fuite accidentelle : un template littéral, un
   * `console.log`, un `res.json()` ou un logger structuré ne doivent jamais
   * faire apparaître le mot de passe. Sans eux, `${password}` afficherait
   * « [object Object] » au mieux, la valeur au pire selon le sérialiseur.
   */
  toString(): string {
    return '[mot de passe masqué]';
  }

  toJSON(): string {
    return '[mot de passe masqué]';
  }
}
