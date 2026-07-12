export const ONE_TIME_TOKEN_STORE = Symbol('ONE_TIME_TOKEN_STORE');

/** Les deux familles de liens à usage unique envoyés par email. */
export enum OneTimeTokenPurpose {
  EMAIL_VERIFICATION = 'email-verification',
  PASSWORD_RESET = 'password-reset',
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
