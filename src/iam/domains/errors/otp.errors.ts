import { IamError, IamErrorKind } from './iam.error';
import { TfaMethodType } from '../enums/tfa-method.enum';

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

/**
 * Le `method` reçu dans le body ne correspond à aucune stratégie enrôlable.
 * La validation du DTO couvre déjà le cas nominal ; cette erreur protège les
 * appels internes (worker, test) qui n'y passent pas.
 */
export class UnsupportedTfaMethodError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(method: string) {
    super(`Méthode de double authentification non supportée : ${method}`);
  }
}

/** Le code OTP saisi pour confirmer l'enrôlement est faux ou expiré. */
export class InvalidOtpCodeError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(message = 'Code invalide ou expiré') {
    super(message);
  }
}

/**
 * Confirmation demandée alors qu'aucun enrôlement n'a été démarré pour ce
 * canal — il faut rappeler `POST /auth/otp/enroll` avant
 * `POST /auth/otp/enroll/confirm`.
 */
export class TfaEnrollmentNotStartedError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;
  constructor(method: TfaMethodType) {
    super(`Aucun enrôlement ${method} en cours pour ce compte.`);
  }
}

/**
 * Ce canal est déjà enrôlé et actif sur cette destination : il n'y a rien à
 * enrôler. Renvoyer un code ici relèverait du parcours de connexion, pas de
 * l'enrôlement.
 */
export class TfaMethodAlreadyEnrolledError extends IamError {
  readonly kind = IamErrorKind.CONFLICT;
  constructor(method: TfaMethodType) {
    super(
      `La double authentification ${method} est déjà active sur ce compte.`,
    );
  }
}

/** Le canal SMS exige un numéro de destination, absent du body. */
export class MissingPhoneNumberError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(
    message = "Un numéro de téléphone est requis pour l'enrôlement SMS.",
  ) {
    super(message);
  }
}
