import { MfaMethodType } from '../enums/mfa-method.enum';
import { MfaMethod } from '../models/mfa-method';

export const MFA_METHOD_REPOSITORY = Symbol('MFA_METHOD_REPOSITORY');

/**
 * Port de persistance des facteurs MFA — **un seul**, pour les trois canaux.
 *
 * Il y avait `TotpMethodRepository` et `ChannelTfaMethodRepository`, ce dernier
 * relié deux fois sous deux tokens (`EMAIL_METHOD_REPOSITORY`,
 * `SMS_METHOD_REPOSITORY`). Les trois contrats étaient rigoureusement le même
 * cycle de vie — créer en attente → confirmer → devenir l'unique méthode
 * active du canal — et leur séparation ne servait qu'à choisir quelle table
 * fille interroger. Le canal étant désormais une **colonne**, il devient un
 * paramètre : trois implémentations disparaissent, le contrat ne bouge pas.
 *
 * Deux portées de désactivation, nommées pour ne pas être confondues :
 * `deactivateChannel` ne touche qu'un canal, `deactivateAll` retire tout le
 * compte. L'invariant du contexte est qu'un compte a **au plus un facteur
 * actif, tous canaux confondus** — c'est donc `deactivateAll` que l'activation
 * appelle. Un seul paramètre optionnel aurait suffi techniquement, mais la
 * portée se serait alors lue à la présence d'un argument, là où elle décide
 * si un second facteur survit à l'activation du premier.
 */
export interface MfaMethodRepository {
  /** Crée un facteur inactif et retourne son identifiant. */
  create(
    userId: number,
    method: MfaMethodType,
    credential: string,
  ): Promise<number>;

  /** Facteurs de ce canal enrôlés par l'utilisateur, le plus récent en premier. */
  findAllByUserId(userId: number, method: MfaMethodType): Promise<MfaMethod[]>;

  /**
   * Supprime les enrôlements de ce canal jamais confirmés. Appelé au début de
   * chaque enrôlement : il garantit qu'il existe **au plus un** facteur en
   * attente par canal, donc que la confirmation n'a jamais à deviner lequel
   * des enrôlements inactifs l'utilisateur est en train de prouver.
   */
  deletePendingForUser(userId: number, method: MfaMethodType): Promise<void>;

  /** Désactive les facteurs d'un canal — utilisé par le retrait d'un facteur. */
  deactivateChannel(userId: number, method: MfaMethodType): Promise<void>;

  /**
   * Désactive **tous** les facteurs du compte, quel que soit le canal. Appelé
   * juste avant chaque activation : c'est ce qui tient l'invariant « au plus
   * un facteur actif ». Sans cela, enrôler l'email sur un compte déjà protégé
   * par TOTP laisserait les deux armés, et la connexion n'opposerait que le
   * premier canal de la liste de préférence — l'autre deviendrait un second
   * chemin d'entrée dont l'utilisateur ignore l'existence.
   */
  deactivateAll(userId: number): Promise<void>;

  activate(methodId: number): Promise<void>;
}
