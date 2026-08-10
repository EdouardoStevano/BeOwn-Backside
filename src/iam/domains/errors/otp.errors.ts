import { IamError, IamErrorKind } from './iam.error';

/** Un OTP encore valide existe déjà pour ce canal — il faut attendre le TTL. */
export class OtpAlreadyActiveError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(message = 'Un OTP est déjà actif, veuillez patienter') {
    super(message);
  }
}

/** Numéro hors format E.164. */
export class InvalidPhoneNumberError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(
    message = 'Numéro de téléphone invalide (format E.164 attendu, ex: +33612345678).',
  ) {
    super(message);
  }
}

/**
 * L'OTP a été généré mais n'a pas pu être remis (email ou SMS). L'appelant
 * peut réessayer : le use case invalide l'OTP avant de lever cette erreur.
 */
export class OtpDeliveryFailedError extends IamError {
  readonly kind = IamErrorKind.UNEXPECTED;
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}

/** Aucune méthode TOTP enrôlée pour ce compte. */
export class TotpNotConfiguredError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;
  constructor(message = 'TOTP non configure') {
    super(message);
  }
}

/** Le code TOTP saisi ne correspond pas au secret enrôlé. */
export class InvalidTotpCodeError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(message = 'Code TOTP invalide') {
    super(message);
  }
}

/** Le secret TOTP stocké est illisible (chiffré avec une autre clé, corrompu). */
export class InvalidTotpSecretError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(message = 'Secret TOTP invalide') {
    super(message);
  }
}
