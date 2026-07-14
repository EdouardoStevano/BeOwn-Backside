import { TfaMethod } from 'src/users/domains/tfa-method';
import { TwoFactorMethod } from 'src/users/domains/enums/user.enum';

export const TFA_REPOSITORY = Symbol('TFA_REPOSITORY');

/**
 * Les méthodes de second facteur enrôlées sur un compte.
 *
 * Séparé du UserRepository : ces lignes portent des secrets (secret TOTP,
 * numéro de téléphone) qu'on ne veut charger que lorsqu'on en a explicitement
 * besoin — jamais au fil d'un `findByEmail` d'authentification.
 */
export interface TfaRepository {
  findOne(userId: number, method: TwoFactorMethod): Promise<TfaMethod | null>;

  /** La méthode confirmée par l'utilisateur, quel que soit le canal. */
  findActive(userId: number): Promise<TfaMethod | null>;

  /** Crée la méthode, ou remplace celle du même canal si elle existe déjà. */
  upsert(userId: number, method: TfaMethod): Promise<TfaMethod>;

  /** Active ce canal et désactive tous les autres : une seule méthode à la fois. */
  activateOnly(userId: number, method: TwoFactorMethod): Promise<void>;

  deactivateAll(userId: number): Promise<void>;
}
