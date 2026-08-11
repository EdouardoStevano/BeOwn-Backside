import { TotpMethod } from '../models/totp-method';

export const TOTP_METHOD_REPOSITORY = Symbol('TOTP_METHOD_REPOSITORY');

export interface TotpMethodRepository {
  create(userId: number, encryptedSecret: string): Promise<void>;
  /** Méthodes enrôlées par l'utilisateur, la plus récente en premier. */
  findAllByUserId(userId: number): Promise<TotpMethod[]>;
  /**
   * Supprime les secrets jamais confirmés. Appelé au début de chaque
   * enrôlement, comme sur les canaux email/SMS : sans lui, chaque QR code
   * affiché puis abandonné laisserait une ligne inactive de plus, et la
   * confirmation devrait toutes les parcourir pour trouver celle que
   * l'utilisateur prouve.
   */
  deletePendingForUser(userId: number): Promise<void>;
  deactivateAllForUser(userId: number): Promise<void>;
  activate(methodId: number): Promise<void>;
}
