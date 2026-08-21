import { IamError, IamErrorKind } from './iam.error';

/** Message unique : l'appelant ne doit pas pouvoir distinguer la cause d'échec. */
export const INVALID_EMAIL_TOKEN_MESSAGE = 'Token invalide ou expiré';

/**
 * Le token présenté est signé mais n'est pas un token de vérification d'email
 * (typiquement un token de réinitialisation de mot de passe, délivré par le
 * même canal). Distinct de `InvalidEmailVerificationTokenError` : ce cas était
 * — et reste — le seul à ne pas être absorbé par le `catch` générique du use
 * case, d'où deux classes malgré un message identique.
 */
export class EmailVerificationTokenTypeError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor(message = INVALID_EMAIL_TOKEN_MESSAGE) {
    super(message);
  }
}

/** Signature invalide, JWT expiré, rejeu d'un token à usage unique, compte inconnu. */
export class InvalidEmailVerificationTokenError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(message = INVALID_EMAIL_TOKEN_MESSAGE) {
    super(message);
  }
}
