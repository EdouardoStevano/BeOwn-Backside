import {
  ConflictDomainError,
  ForbiddenDomainError,
  InvalidInputDomainError,
  NotFoundDomainError,
  UnauthorizedDomainError,
} from 'src/common/domain/domain-error';

export class AccessDeniedError extends ForbiddenDomainError {
  readonly code = 'ACCESS_DENIED';

  constructor(message = 'Accès refusé.') {
    super(message);
  }
}

export class AdminAccessRequiredError extends ForbiddenDomainError {
  readonly code = 'ADMIN_ACCESS_REQUIRED';

  constructor() {
    super('Accès réservé aux administrateurs.');
  }
}

export class InvalidUserTypeError extends InvalidInputDomainError {
  readonly code = 'INVALID_USER_TYPE';

  constructor() {
    super('Type invalide : PP ou PM attendu.');
  }
}

export class UserNotFoundError extends NotFoundDomainError {
  readonly code = 'USER_NOT_FOUND';

  constructor() {
    super('Utilisateur introuvable.');
  }
}

export class EmailAlreadyInUseError extends ConflictDomainError {
  readonly code = 'EMAIL_ALREADY_IN_USE';

  constructor() {
    super('Un compte avec cette email existe déjà.');
  }
}

export class PasswordConfirmationFailedError extends UnauthorizedDomainError {
  readonly code = 'PASSWORD_CONFIRMATION_FAILED';

  constructor(message = 'Mot de passe incorrect.') {
    super(message);
  }
}

export class InvalidEmailError extends InvalidInputDomainError {
  readonly code = 'INVALID_EMAIL';

  constructor(value: string) {
    super(`Adresse email invalide : « ${value} ».`);
  }
}

export class InvalidPhoneNumberError extends InvalidInputDomainError {
  readonly code = 'INVALID_PHONE_NUMBER';

  constructor(value: string) {
    super(`Numéro de téléphone invalide : « ${value} ». Format E.164 attendu.`);
  }
}

export class InvalidTotpSecretError extends InvalidInputDomainError {
  readonly code = 'INVALID_TOTP_SECRET';

  constructor() {
    super('Secret TOTP invalide : encodage base32 attendu.');
  }
}

/** Un compte social (sans mot de passe) ne peut pas confirmer une action par mot de passe. */
export class NoPasswordSetError extends UnauthorizedDomainError {
  readonly code = 'NO_PASSWORD_SET';

  constructor() {
    super('Confirmation impossible : aucun mot de passe défini sur ce compte.');
  }
}
