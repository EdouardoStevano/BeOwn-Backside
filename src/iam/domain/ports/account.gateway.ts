import { AuthAccount } from '../models/auth-account';

export const ACCOUNT_GATEWAY = Symbol('ACCOUNT_GATEWAY');

export interface RegisterAccountInput {
  firstname: string;
  lastname: string | null;
  email: string;
  password: string;
}

export interface RegisterSocialAccountInput {
  firstname: string;
  lastname: string | null;
  email: string;
  socialId: string;
}

/**
 * Couche anti-corruption entre IAM et le contexte Users.
 *
 * IAM ne connaît ni l'agrégat User, ni son repository, ni son hash de mot de
 * passe : il parle à cette interface, écrite dans son propre vocabulaire
 * (compte, identifiants, vérification). L'adapter qui l'implémente traduit vers
 * le contrat publié de Users — c'est le seul point de contact entre les deux
 * contextes, et le seul fichier à retoucher si Users change.
 */
export interface AccountGateway {
  findByEmail(email: string): Promise<AuthAccount | null>;
  findBySocialId(socialId: string): Promise<AuthAccount | null>;

  /** Inscription classique. Renvoie la vue publique attendue par l'API. */
  register(input: RegisterAccountInput): Promise<unknown>;

  /** Première connexion OAuth : crée un compte déjà vérifié. */
  registerSocial(input: RegisterSocialAccountInput): Promise<AuthAccount>;

  /** Confronte un mot de passe en clair au secret détenu par Users. */
  verifyPassword(email: string, plainPassword: string): Promise<boolean>;

  changePassword(email: string, newPlainPassword: string): Promise<void>;

  markEmailAsVerified(email: string): Promise<void>;
}
