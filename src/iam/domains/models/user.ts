import { UserEmail } from 'src/iam/domains/value-objects/user-email.vo';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';

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
 * Représentation exposable du compte : ce que le domaine accepte de publier.
 * L'empreinte du mot de passe en est absente par construction — c'est un type,
 * pas une convention, donc l'oubli est impossible.
 */
export interface PublicUser {
  userId: number;
  firstname: string;
  lastname: string | null;
  socialId: string | null;
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
 * L'empreinte du mot de passe n'a volontairement **aucun getter** : elle ne
 * sort que par `toSnapshot()`, destiné aux mappers de persistance.
 */
export class User {
  private constructor(
    private _userId: number,
    private _firstname: string,
    private _lastname: string | null,
    private _socialId: string | null,
    private _passwordHash: string | null,
    private _role: UserRole,
    private _status: UserStatus,
    private _cguAccepteesLe: Date | null,
    private _lastLoginAt: Date | null,
    private _createdAt: Date,
    private _updatedAt: Date,
    private _userEmail: UserEmail | null,
  ) {}

  /** Nouveau compte : statut CREE, identifiants non encore vérifiés. */
  static register(props: RegisterUserProps): User {
    const email = new UserEmail(props.email);
    if (props.emailVerified) email.verify();

    return new User(
      undefined as unknown as number, // attribué par la persistance
      props.firstname,
      props.lastname,
      props.socialId,
      props.passwordHash,
      UserRole.INVESTISSEUR,
      UserStatus.CREE,
      null,
      null,
      undefined as unknown as Date,
      undefined as unknown as Date,
      email,
    );
  }

  /** Reconstitution depuis la persistance. Réservé aux mappers. */
  static restore(snapshot: UserSnapshot): User {
    return new User(
      snapshot.userId,
      snapshot.firstname,
      snapshot.lastname,
      snapshot.socialId,
      snapshot.passwordHash,
      snapshot.role,
      snapshot.status,
      snapshot.cguAccepteesLe,
      snapshot.lastLoginAt,
      snapshot.createdAt,
      snapshot.updatedAt,
      snapshot.userEmail,
    );
  }

  // ── Lectures (aucun setter) ───────────────────────────────────────────────

  get userId(): number {
    return this._userId;
  }
  get firstname(): string {
    return this._firstname;
  }
  get lastname(): string | null {
    return this._lastname;
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

  /** Renvoie `true` si quelque chose a changé — utile pour l'audit. */
  rename(firstname?: string, lastname?: string | null): boolean {
    let changed = false;
    if (firstname !== undefined && firstname !== this._firstname) {
      this._firstname = firstname;
      changed = true;
    }
    if (lastname !== undefined && (lastname ?? null) !== this._lastname) {
      this._lastname = lastname ?? null;
      changed = true;
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
   * Indispensable depuis que l'état est privé : les contrôleurs faisaient
   * `const { password, ...safe } = user`, ce qui produirait désormais des clés
   * `_userId`, `_firstname`… et surtout laisserait passer `_passwordHash`.
   * `res.json()` appelle automatiquement ce `toJSON`, ce qui protège aussi les
   * chemins de sérialisation indirects.
   */
  toJSON(): PublicUser {
    return {
      userId: this._userId,
      firstname: this._firstname,
      lastname: this._lastname,
      socialId: this._socialId,
      role: this._role,
      status: this._status,
      cguAccepteesLe: this._cguAccepteesLe,
      lastLoginAt: this._lastLoginAt,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      userEmail: this._userEmail,
    };
  }

  // ── Persistance ───────────────────────────────────────────────────────────

  /**
   * Échappatoire assumée et unique : les mappers ont besoin de l'état complet,
   * empreinte du mot de passe comprise. Ne pas appeler depuis `applications/`
   * — les use cases doivent passer par les méthodes ci-dessus.
   */
  toSnapshot(): UserSnapshot {
    return {
      userId: this._userId,
      firstname: this._firstname,
      lastname: this._lastname,
      socialId: this._socialId,
      passwordHash: this._passwordHash,
      role: this._role,
      status: this._status,
      cguAccepteesLe: this._cguAccepteesLe,
      lastLoginAt: this._lastLoginAt,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      userEmail: this._userEmail,
    };
  }
}
