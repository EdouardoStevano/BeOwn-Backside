import { ChannelTfaMethod } from '../models/channel-tfa-method';

/**
 * Port de persistance des méthodes 2FA « à canal » (email, SMS).
 *
 * Une seule interface pour deux canaux : leur cycle de vie est identique
 * (créer en attente → confirmer → devenir l'unique méthode active du canal),
 * seule la colonne de destination change côté ORM. Deux **tokens** distincts
 * permettent d'injecter l'un ou l'autre adapter sans multiplier les contrats
 * (§4 — DIP + LSP : les deux implémentations sont substituables).
 */
export interface ChannelTfaMethodRepository {
  /** Crée une méthode inactive et retourne son identifiant. */
  create(userId: number, target: string): Promise<number>;
  /** Méthodes enrôlées par l'utilisateur, la plus récente en premier. */
  findAllByUserId(userId: number): Promise<ChannelTfaMethod[]>;
  /**
   * Supprime les enrôlements jamais confirmés de ce canal. Appelé au début de
   * chaque enrôlement : il garantit qu'il existe **au plus une** méthode en
   * attente par canal, donc que la confirmation n'a jamais à deviner laquelle
   * des lignes inactives l'utilisateur est en train de prouver.
   */
  deletePendingForUser(userId: number): Promise<void>;
  deactivateAllForUser(userId: number): Promise<void>;
  activate(methodId: number): Promise<void>;
}

export const EMAIL_METHOD_REPOSITORY = Symbol('EMAIL_METHOD_REPOSITORY');
export const SMS_METHOD_REPOSITORY = Symbol('SMS_METHOD_REPOSITORY');
