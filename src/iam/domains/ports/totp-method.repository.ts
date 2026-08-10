import { TotpMethod } from '../models/totp-method';

export const TOTP_METHOD_REPOSITORY = Symbol('TOTP_METHOD_REPOSITORY');

export interface TotpMethodRepository {
  create(userId: number, encryptedSecret: string): Promise<void>;
  /** Méthodes enrôlées par l'utilisateur, la plus récente en premier. */
  findAllByUserId(userId: number): Promise<TotpMethod[]>;
  deactivateAllForUser(userId: number): Promise<void>;
  activate(methodId: number): Promise<void>;
}
