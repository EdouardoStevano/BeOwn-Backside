import { TfaMethod } from './tfa-method';
import { UserEmail } from './value-objects/user-email.vo';
import {
  ADMIN_ROLES,
  RegimeFiscal,
  UserRole,
  UserStatus,
  UserType,
} from './enums/user.enum';

export { RegimeFiscal, UserRole, UserStatus, UserType };

/**
 * Agrégat Utilisateur. Toute modification d'état passe par une méthode : les
 * appelants (handlers, contrôleurs) ne réaffectent plus les champs à la main,
 * ce qui garantit que les règles restent au même endroit que la donnée.
 *
 * Les champs sont publics parce que l'objet est sérialisé directement dans les
 * réponses HTTP — les rendre privés changerait la forme du JSON renvoyé.
 */
export class User {
  userId: number;
  firstname: string;
  lastname: string | null;
  socialId: string | null;
  password: string | null;
  role: UserRole;
  status: UserStatus;
  userType: UserType | null;
  regimeFiscal: RegimeFiscal;
  cguAccepteesLe: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userEmail: UserEmail;
  tfaMethods: TfaMethod[] = [];

  // ─── Identité ────────────────────────────────────────────────────────────

  rename(firstname?: string, lastname?: string | null): void {
    if (firstname !== undefined) this.firstname = firstname;
    if (lastname !== undefined) this.lastname = lastname ?? null;
  }

  get fullName(): string {
    return [this.firstname, this.lastname].filter(Boolean).join(' ');
  }

  // ─── Email ───────────────────────────────────────────────────────────────

  verifyEmail(): void {
    this.userEmail.verify();
  }

  get isEmailVerified(): boolean {
    return this.userEmail.isVerified;
  }

  // ─── Identifiants ────────────────────────────────────────────────────────

  /** Reçoit un hash déjà calculé : le domaine ne connaît pas l'algorithme. */
  changePassword(passwordHash: string): void {
    this.password = passwordHash;
  }

  get hasPassword(): boolean {
    return !!this.password;
  }

  recordLogin(at: Date = new Date()): void {
    this.lastLoginAt = at;
  }

  // ─── Cycle de vie ────────────────────────────────────────────────────────

  changeRole(role: UserRole): void {
    this.role = role;
  }

  /** Un compte back-office. Utilisé pour autoriser les endpoints d'administration. */
  get isAdmin(): boolean {
    return ADMIN_ROLES.includes(this.role);
  }

  changeStatus(status: UserStatus): void {
    this.status = status;
  }

  suspend(): void {
    this.status = UserStatus.SUSPENDU;
  }

  /** Suppression logique : le compte reste en base pour les obligations légales. */
  markAsDeleted(): void {
    this.status = UserStatus.SUPPRIME;
  }

  get isDeleted(): boolean {
    return this.status === UserStatus.SUPPRIME;
  }

  // ─── Qualification investisseur ──────────────────────────────────────────

  setUserType(type: UserType): void {
    this.userType = type;
  }
}
