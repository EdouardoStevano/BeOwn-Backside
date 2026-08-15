import { IamError, IamErrorKind } from './iam.error';
import { MfaMethodType } from '../enums/mfa-method.enum';

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
export class UnsupportedMfaMethodError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(method: string) {
    super(`Méthode de authentification multifacteur non supportée : ${method}`);
  }
}

/**
 * Plafond d'essais atteint sur un OTP : l'entrée est détruite, il faut en
 * redemander un.
 *
 * Auparavant un `throw new Error(...)` nu, levé depuis l'adapter de cache —
 * donc une 500 pour ce qui est une situation métier parfaitement prévue. La
 * règle ayant rejoint `OtpService`, elle s'exprime dans le vocabulaire du
 * domaine et se traduit en réponse propre (§12.1).
 */
export class TooManyOtpAttemptsError extends IamError {
  readonly kind = IamErrorKind.CONFLICT;
  constructor() {
    super('Trop de tentatives — demandez un nouveau code.', {
      code: 'OTP_TOO_MANY_ATTEMPTS',
    });
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
 * canal — il faut rappeler `POST /auth/mfa/enroll` avant
 * `POST /auth/mfa/enable`.
 */
export class MfaEnrollmentNotStartedError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;
  constructor(method: MfaMethodType) {
    super(`Aucun enrôlement ${method} en cours pour ce compte.`);
  }
}

/**
 * Ce canal est déjà enrôlé et actif sur cette destination : il n'y a rien à
 * enrôler. Renvoyer un code ici relèverait du parcours de connexion, pas de
 * l'enrôlement.
 */
export class MfaMethodAlreadyEnrolledError extends IamError {
  readonly kind = IamErrorKind.CONFLICT;
  constructor(method: MfaMethodType) {
    super(
      `La authentification multifacteur ${method} est déjà active sur ce compte.`,
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
