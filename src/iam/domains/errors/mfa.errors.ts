import { IamError, IamErrorKind } from './iam.error';

/**
 * Challenge inconnu, déjà consommé ou expiré.
 *
 * Les trois cas partagent volontairement une seule erreur : les distinguer
 * apprendrait à un attaquant qu'un identifiant a existé, et la conduite à
 * tenir est la même dans les trois cas — refaire une demande.
 */
export class MfaChallengeNotFoundError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super('Challenge inconnu ou expiré — recommencez la vérification.', {
      code: 'MFA_CHALLENGE_INVALID',
    });
  }
}

/**
 * Le challenge présenté a bien été émis, mais pour autre chose : typiquement
 * un challenge de connexion rejoué sur la désactivation. Le message reste muet
 * sur le vrai `purpose`.
 */
export class MfaChallengePurposeMismatchError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super('Challenge inconnu ou expiré — recommencez la vérification.', {
      code: 'MFA_CHALLENGE_INVALID',
    });
  }
}

/** Opération qui suppose un facteur actif alors que le compte n'en a aucun. */
export class NoActiveMfaMethodError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;
  constructor() {
    super(
      "Aucune méthode de double authentification n'est active sur ce compte.",
      {
        code: 'MFA_NOT_ENABLED',
      },
    );
  }
}

/**
 * `POST /auth/mfa/enable` appelé sans enrôlement en cours. Le body ne porte
 * pas de canal : c'est l'enrôlement en attente qui le désigne, et il n'y en a
 * pas.
 */
export class NoPendingMfaEnrollmentError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;
  constructor() {
    super(
      'Aucun enrôlement en cours — appelez POST /auth/mfa/enroll au préalable.',
      { code: 'MFA_ENROLLMENT_NOT_STARTED' },
    );
  }
}
