/**
 * L'état d'un compte, dans le vocabulaire d'IAM.
 *
 * Volontairement plus grossier que le `UserStatus` du contexte Users : IAM ne
 * se demande pas si l'onboarding est terminé, seulement s'il a le droit
 * d'ouvrir une session. La traduction se fait dans la couche anti-corruption
 * (cf. UsersAccountGateway), comme pour TwoFactorMethod.
 */
export enum AccountStatus {
  /** Le compte existe et n'est sous le coup d'aucune sanction. */
  ACTIVE = 'active',
  /** Suspendu par un administrateur — réversible. */
  SUSPENDED = 'suspended',
  /** Clôturé ou supprimé — terminal. */
  CLOSED = 'closed',
}
