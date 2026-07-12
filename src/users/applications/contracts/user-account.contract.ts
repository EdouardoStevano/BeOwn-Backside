import {
  UserRole,
  UserStatus,
  UserType,
} from 'src/users/domains/enums/user.enum';

export const USER_ACCOUNT_SERVICE = Symbol('USER_ACCOUNT_SERVICE');

/**
 * Contrat publié du contexte Users — la seule surface que les autres contextes
 * (IAM en particulier) ont le droit d'appeler.
 *
 * Il n'expose ni l'agrégat User, ni le repository, ni le hash du mot de passe :
 * un contexte extérieur ne peut donc plus écrire dans les entrailles de Users.
 * Toute vérification d'identifiant reste du côté du propriétaire de la donnée.
 */

/** Projection minimale d'un compte, suffisante pour authentifier. */
export interface UserAccountSnapshot {
  userId: number;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  /** Un compte créé via OAuth n'a pas de mot de passe. */
  hasPassword: boolean;
}

/** Vue publique d'un utilisateur, telle que renvoyée par les endpoints d'inscription. */
export interface PublicUserView {
  userId: number;
  firstname: string;
  lastname: string | null;
  socialId: string | null;
  role: UserRole;
  status: UserStatus;
  userType: UserType | null;
  cguAccepteesLe: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userEmail: { email: string; isVerified: boolean; verifiedDate: Date | null };
  tfaMethods: unknown[];
}

export interface RegisterUserInput {
  firstname: string;
  lastname: string | null;
  email: string;
  password: string;
}

export interface RegisterSocialUserInput {
  firstname: string;
  lastname: string | null;
  email: string;
  socialId: string;
}

export interface UserAccountService {
  findByEmail(email: string): Promise<UserAccountSnapshot | null>;
  findBySocialId(socialId: string): Promise<UserAccountSnapshot | null>;

  /** Inscription classique. Lève EmailAlreadyInUseError si l'adresse est prise. */
  register(input: RegisterUserInput): Promise<PublicUserView>;

  /** Première connexion via un fournisseur OAuth : le compte est créé vérifié. */
  registerSocial(input: RegisterSocialUserInput): Promise<UserAccountSnapshot>;

  /** Confronte un mot de passe en clair au hash stocké. Le hash ne sort jamais d'ici. */
  verifyPassword(email: string, plainPassword: string): Promise<boolean>;

  /** Remplace le mot de passe. Le hachage est fait par Users, propriétaire du secret. */
  changePassword(email: string, newPlainPassword: string): Promise<void>;

  markEmailAsVerified(email: string): Promise<void>;
}
