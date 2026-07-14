export const ONE_TIME_TOKEN_STORE = Symbol('ONE_TIME_TOKEN_STORE');

/** Les familles de jetons à usage unique émis par IAM. */
export enum OneTimeTokenPurpose {
  EMAIL_VERIFICATION = 'email-verification',
  PASSWORD_RESET = 'password-reset',
  /**
   * Le sas entre « mot de passe validé » et « code 2FA validé ». Il n'est pas
   * envoyé par email : il est remis au client, qui le rejoue pour prouver qu'il
   * a déjà passé la première étape.
   */
  TWO_FACTOR_CHALLENGE = 'two-factor-challenge',
}

/**
 * Liens à usage unique.
 *
 * L'identifiant du token est mémorisé côté serveur : c'est lui, et non la
 * signature du JWT, qui rend le lien consommable une seule fois. `issue` écrase
 * l'identifiant précédent — demander un nouveau lien tue donc l'ancien.
 */
export interface OneTimeTokenStore {
  issue(
    purpose: OneTimeTokenPurpose,
    email: string,
    tokenId: string,
  ): Promise<void>;

  isPending(
    purpose: OneTimeTokenPurpose,
    email: string,
    tokenId: string,
  ): Promise<boolean>;

  consume(purpose: OneTimeTokenPurpose, email: string): Promise<void>;
}
