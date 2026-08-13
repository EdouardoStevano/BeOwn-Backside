import { UserEmail } from 'src/iam/domains/value-objects/user-email.vo';
import {
  FirstName,
  LastName,
} from 'src/iam/domains/value-objects/person-name.vo';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import {
  UserMapper,
  type PublicUser,
} from 'src/iam/domains/mappers/user.mapper';

/**
 * Compare un mot de passe en clair à son empreinte. Injecté à l'appel plutôt
 * qu'au constructeur : le domaine exprime le besoin (« sais-tu comparer deux
 * mots de passe ? ») sans dépendre de bcrypt ni d'un service NestJS (§12.1).
 */
export type PasswordComparator = (
  plain: string,
  hash: string,
) => Promise<boolean>;

/** État complet du compte, tel qu'il transite depuis/vers la persistance. */
export interface UserSnapshot {
  userId: number;
  firstname: string;
  lastname: string | null;
  socialId: string | null;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  cguAccepteesLe: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userEmail: UserEmail | null;
}

/**
 * État interne du compte : le snapshot, mais avec ses Value Objects plutôt que
 * les primitives qu'attend la persistance.
 *
 * @internal Ce que reçoit le constructeur. La traduction dans un sens
 * (persistance → VO permissifs) appartient à `UserMapper`, dans l'autre
 * (entrée → VO validants) à `User.register`.
 */
export interface UserState {
  userId: number;
  firstname: FirstName;
  lastname: LastName | null;
  socialId: string | null;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  cguAccepteesLe: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userEmail: UserEmail | null;
}

export interface RegisterUserProps {
  firstname: string;
  lastname: string | null;
  email: string;
  /** Déjà hachée — le domaine ne connaît aucun algorithme de hachage. */
  passwordHash: string | null;
  socialId: string | null;
  emailVerified?: boolean;
}

/**
 * Compte utilisateur.
 *
 * L'état est privé et exposé en **lecture seule**. Toute comparaison et toute
 * transition passent par une méthode de cette classe : `isSuspended()`,
 * `markEmailAsVerified()`, `changePassword()`… Auparavant les champs étaient
 * publics et mutables, ce qui avait deux conséquences :
 *
 * - l'empreinte du mot de passe circulait librement (`user.password`) et
 *   chaque appelant refaisait la comparaison à la main ;
 * - les règles de statut étaient dupliquées dans cinq use cases sous forme de
 *   `user.status === UserStatus.CLOS || user.status === UserStatus.SUPPRIME`.
 *   Ajouter un statut imposait de retrouver toutes ces copies.
 *
 * L'empreinte du mot de passe ne sort que par le getter `passwordHash`, marqué
 * `@internal` et destiné au seul `UserMapper` : un use case qui doit éprouver
 * un mot de passe passe par `verifyPassword()`, qui ne rend qu'un verdict.
 *
 * La conversion vers les représentations sortantes (snapshot de persistance,
 * projection publiable) appartient à `UserMapper` — cette classe ne porte plus
 * que le métier (§4 — SRP).
 */
export class User {
  private _userId: number;
  private _firstname: FirstName;
  private _lastname: LastName | null;
  private _socialId: string | null;
  private _passwordHash: string | null;
  private _role: UserRole;
  private _status: UserStatus;
  private _cguAccepteesLe: Date | null;
  private _lastLoginAt: Date | null;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _userEmail: UserEmail | null;

  /**
   * @internal Réservé à `User.register` et à `UserMapper`.
   *
   * Public faute de mieux : TypeScript n'a pas de classe amie, et `UserMapper`
   * — qui reconstitue un compte depuis la persistance — doit pouvoir
   * l'appeler. Il n'ouvre rien de plus que l'ancien `User.restore`, public lui
   * aussi. Les invariants restent portés par `register()`, seul chemin de
   * **création** d'un compte : passer par ici, c'est se déclarer mapper.
   */
  constructor(state: UserState) {
    this._userId = state.userId;
    this._firstname = state.firstname;
    this._lastname = state.lastname;
    this._socialId = state.socialId;
    this._passwordHash = state.passwordHash;
    this._role = state.role;
    this._status = state.status;
    this._cguAccepteesLe = state.cguAccepteesLe;
    this._lastLoginAt = state.lastLoginAt;
    this._createdAt = state.createdAt;
    this._updatedAt = state.updatedAt;
    this._userEmail = state.userEmail;
  }

  /** Nouveau compte : statut CREE, identifiants non encore vérifiés. */
  static register(props: RegisterUserProps): User {
    const email = new UserEmail(props.email);
    if (props.emailVerified) email.verify();

    return new User({
      userId: undefined as unknown as number, // attribué par la persistance
      // Éprouvés ici et non par l'appelant : un compte ne peut pas naître avec
      // un prénom vide, quel que soit le point d'entrée (HTTP, import, script).
      firstname: FirstName.of(props.firstname),
      lastname: LastName.of(props.lastname),
      socialId: props.socialId,
      passwordHash: props.passwordHash,
      role: UserRole.INVESTISSEUR,
      status: UserStatus.CREE,
      cguAccepteesLe: null,
      lastLoginAt: null,
      createdAt: undefined as unknown as Date,
      updatedAt: undefined as unknown as Date,
      userEmail: email,
    });
  }

  // ── Lectures (aucun setter) ───────────────────────────────────────────────

  get userId(): number {
    return this._userId;
  }
  /** Le VO reste interne : les appelants continuent de lire des chaînes. */
  get firstname(): string {
    return this._firstname.value;
  }
  get lastname(): string | null {
    return this._lastname?.value ?? null;
  }
  get socialId(): string | null {
    return this._socialId;
  }
  get role(): UserRole {
    return this._role;
  }
  get status(): UserStatus {
    return this._status;
  }
  get cguAccepteesLe(): Date | null {
    return this._cguAccepteesLe;
  }
  get lastLoginAt(): Date | null {
    return this._lastLoginAt;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
  /** VO en lecture seule : `verify()` reste inaccessible sans passer par l'entité. */
  get userEmail(): UserEmail | null {
    return this._userEmail;
  }
  /** Raccourci de lecture — l'adresse est toujours présente en pratique. */
  get email(): string {
    return this._userEmail?.email ?? '';
  }

  // ── Règles métier ─────────────────────────────────────────────────────────

  /** Un compte social sans mot de passe ne peut pas se connecter par mot de passe. */
  hasPassword(): boolean {
    return this._passwordHash !== null && this._passwordHash !== undefined;
  }

  /**
   * Seul point de sortie de l'empreinte : elle n'est jamais retournée, on ne
   * renvoie que le verdict. Un compte sans mot de passe échoue toujours,
   * plutôt que de laisser l'appelant déréférencer `password!`.
   */
  async verifyPassword(
    plain: string,
    compare: PasswordComparator,
  ): Promise<boolean> {
    if (!this.hasPassword()) return false;
    return compare(plain, this._passwordHash as string);
  }

  isEmailVerified(): boolean {
    return this._userEmail?.isVerified ?? false;
  }

  isSuspended(): boolean {
    return this._status === UserStatus.SUSPENDU;
  }

  /** CLOS et SUPPRIME sont traités ensemble partout : une seule règle ici. */
  isClosed(): boolean {
    return (
      this._status === UserStatus.CLOS || this._status === UserStatus.SUPPRIME
    );
  }

  isDeleted(): boolean {
    return this._status === UserStatus.SUPPRIME;
  }

  /**
   * Un compte sanctionné ne doit jamais obtenir de nouveaux tokens, quel que
   * soit le flux (connexion, OTP d'inscription, OAuth).
   */
  canOpenSession(): boolean {
    return !this.isSuspended() && !this.isClosed();
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Vérifie l'adresse et fait avancer le cycle de vie du compte. Le passage
   * CREE → EMAIL_VERIFIE était recopié dans trois use cases ; il vit ici, de
   * sorte qu'aucun appelant ne puisse vérifier l'email en oubliant le statut.
   */
  markEmailAsVerified(): void {
    this._userEmail?.verify();
    if (this._status === UserStatus.CREE) {
      this._status = UserStatus.EMAIL_VERIFIE;
    }
  }

  /** `hash` est déjà haché par l'appelant (port de hachage). */
  changePassword(hash: string): void {
    this._passwordHash = hash;
  }

  /**
   * Renvoie `true` si quelque chose a changé — utile pour l'audit.
   *
   * Les valeurs passent par les VO, donc renommer obéit exactement aux mêmes
   * règles que s'inscrire. Auparavant la seule barrière était `UpdateUserDto`,
   * et elle exigeait 2 caractères là où `SignUpDto` se contentait d'un champ
   * non vide : le même compte pouvait naître avec un prénom d'une lettre mais
   * ne plus pouvoir y revenir.
   */
  rename(firstname?: string, lastname?: string | null): boolean {
    let changed = false;

    if (firstname !== undefined) {
      const next = FirstName.of(firstname);
      if (!next.equals(this._firstname)) {
        this._firstname = next;
        changed = true;
      }
    }

    if (lastname !== undefined) {
      const next = LastName.of(lastname);
      const unchanged = next
        ? next.equals(this._lastname)
        : this._lastname === null;
      if (!unchanged) {
        this._lastname = next;
        changed = true;
      }
    }

    return changed;
  }

  markAsDeleted(): void {
    this._status = UserStatus.SUPPRIME;
  }

  // ── Sérialisation ─────────────────────────────────────────────────────────

  /**
   * Représentation exposable du compte — **sans l'empreinte du mot de passe**.
   *
   * La mise en forme appartient à {@link UserMapper} (§4 — SRP) ; seul le point
   * d'accroche reste ici, et il doit y rester : `res.json()` appelle
   * automatiquement `toJSON()`, ce qui protège aussi les chemins de
   * sérialisation indirects — un `User` glissé dans une réponse sans passer par
   * un appel explicite. Sans cette méthode, il ressortirait avec ses clés
   * privées `_userId`, `_firstname`… et surtout `_passwordHash`.
   */
  toJSON(): PublicUser {
    return UserMapper.toPublic(this);
  }

  get passwordHash(): string | null {
    return this._passwordHash;
  }
}
