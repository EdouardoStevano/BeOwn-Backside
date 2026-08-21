import { IamError, IamErrorKind } from './iam.error';

/**
 * Message unique pour « email inconnu » et « mot de passe faux » : les
 * distinguer permettrait d'énumérer les comptes existants.
 */
export const INVALID_CREDENTIALS_MESSAGE =
  'Adresse email ou mot de passe incorrect';

export class InvalidCredentialsError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super(INVALID_CREDENTIALS_MESSAGE);
  }
}

/**
 * Refresh token absent, expiré, révoqué ou rejoué. Message volontairement nu :
 * il reproduit le corps que Nest produisait pour un `UnauthorizedException()`
 * sans argument, sur lequel le front s'appuie déjà.
 */
export class InvalidRefreshTokenError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super('Unauthorized');
  }
}

/** Access token illisible : signature invalide, expiré, ou forgé. */
export class InvalidAccessTokenError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor(message = 'Token invalide') {
    super(message);
  }
}

/** Code OAuth à usage unique inconnu ou déjà consommé (TTL 30 s). */
export class InvalidOAuthCodeError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super('Code invalide ou expiré');
  }
}

/** Le fournisseur social n'a pas permis d'établir une identité exploitable. */
export class SocialAuthFailedError extends IamError {
  readonly kind = IamErrorKind.UNEXPECTED;
  constructor(message = 'Authentification échouée') {
    super(message);
  }
}

/** Un compte existe déjà pour cette adresse. */
export class EmailAlreadyRegisteredError extends IamError {
  readonly kind = IamErrorKind.CONFLICT;
  constructor(message = 'Un compte avec cette email existe déjà.') {
    super(message);
  }
}

/**
 * Token de réinitialisation invalide, expiré, déjà consommé, ou d'un autre
 * type. Message identique dans tous les cas — même raison d'anti-énumération.
 */
export class InvalidPasswordResetTokenError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor(message = 'Token invalide ou expiré') {
    super(message);
  }
}

/** L'email de réinitialisation n'a pas pu être remis au transport. */
export class PasswordResetEmailFailedError extends IamError {
  readonly kind = IamErrorKind.UNEXPECTED;
  constructor(cause?: unknown) {
    super(
      "Impossible d'envoyer l'email de réinitialisation. Veuillez réessayer.",
      { cause },
    );
  }
}

/** Code stable du conflit d'inscription non imputable aux données saisies. */
export const REGISTRATION_CONFLICT_CODE = 'REGISTRATION_CONFLICT';

/**
 * L'inscription a heurté une contrainte d'unicité AUTRE que l'adresse e-mail
 * — en pratique la clé primaire de `user_emails` quand la séquence Postgres a
 * été désynchronisée par un insert SQL manuel.
 *
 * Ce n'est pas une erreur de saisie : l'utilisateur est invité à réessayer, et
 * l'exploitation reçoit la contrainte violée dans les logs. Avant ce mapping,
 * le cas remontait en `500 Internal server error` (ANO-01).
 */
export class RegistrationConflictError extends IamError {
  readonly kind = IamErrorKind.CONFLICT;
  constructor(options: { cause?: unknown } = {}) {
    super(
      "Votre inscription n'a pas pu être enregistrée. Merci de réessayer dans quelques instants.",
      { code: REGISTRATION_CONFLICT_CODE, cause: options.cause },
    );
  }
}
