import {
  ConflictDomainError,
  ExternalServiceDomainError,
  InvalidInputDomainError,
  NotFoundDomainError,
  UnauthorizedDomainError,
} from 'src/common/domain/domain-error';

// ─── Authentification ──────────────────────────────────────────────────────

/**
 * Message volontairement identique que l'email soit inconnu ou le mot de passe
 * faux : distinguer les deux cas permettrait d'énumérer les comptes existants.
 */
export class InvalidCredentialsError extends UnauthorizedDomainError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Adresse email ou mot de passe incorrect');
  }
}

export class EmailNotVerifiedError extends UnauthorizedDomainError {
  readonly code = 'EMAIL_NOT_VERIFIED';

  constructor() {
    super('Veuillez vérifier votre adresse email avant de vous connecter.');
  }
}

export class InvalidRefreshTokenError extends UnauthorizedDomainError {
  readonly code = 'INVALID_REFRESH_TOKEN';

  constructor() {
    super('Refresh token invalide ou expiré');
  }
}

/** Couvre le token expiré, déjà consommé, révoqué, ou d'un autre type. */
export class InvalidOrExpiredTokenError extends UnauthorizedDomainError {
  readonly code = 'INVALID_OR_EXPIRED_TOKEN';

  constructor() {
    super('Token invalide ou expiré');
  }
}

/** Code d'échange OAuth inconnu, déjà consommé, ou expiré (TTL 30 s). */
export class InvalidOAuthCodeError extends UnauthorizedDomainError {
  readonly code = 'INVALID_OAUTH_CODE';

  constructor() {
    super('Code invalide ou expiré');
  }
}

/**
 * 400 (et non 401) : c'est un lien cliqué depuis un navigateur, pas un appel
 * authentifié — on conserve le statut d'avant le refactor.
 */
export class InvalidEmailVerificationTokenError extends InvalidInputDomainError {
  readonly code = 'INVALID_EMAIL_VERIFICATION_TOKEN';

  constructor() {
    super('Token invalide ou expiré');
  }
}

export class SocialAuthenticationFailedError extends UnauthorizedDomainError {
  readonly code = 'SOCIAL_AUTH_FAILED';

  constructor() {
    super('Authentification échouée');
  }
}

export class AccountAlreadyExistsError extends ConflictDomainError {
  readonly code = 'ACCOUNT_ALREADY_EXISTS';

  constructor() {
    super('Un compte avec cette email existe déjà.');
  }
}

export class AccountNotFoundError extends NotFoundDomainError {
  readonly code = 'ACCOUNT_NOT_FOUND';

  constructor() {
    super('Utilisateur introuvable');
  }
}

/** 400, comme avant : le client peut réessayer avec un nouveau jeton captcha. */
export class CaptchaVerificationFailedError extends InvalidInputDomainError {
  readonly code = 'CAPTCHA_VERIFICATION_FAILED';

  constructor(message = 'Vérification anti-robot échouée.') {
    super(message);
  }
}

// ─── Vérification d'email ──────────────────────────────────────────────────

export class EmailAlreadyVerifiedError extends ConflictDomainError {
  readonly code = 'EMAIL_ALREADY_VERIFIED';

  constructor() {
    super('This email is already verified');
  }
}

// ─── OTP ───────────────────────────────────────────────────────────────────

export class OtpAlreadyActiveError extends InvalidInputDomainError {
  readonly code = 'OTP_ALREADY_ACTIVE';

  constructor(message = 'Un OTP est déjà actif, veuillez patienter') {
    super(message);
  }
}

export class InvalidOtpError extends InvalidInputDomainError {
  readonly code = 'INVALID_OTP';

  constructor(message = 'Code invalide') {
    super(message);
  }
}

export class TooManyOtpAttemptsError extends InvalidInputDomainError {
  readonly code = 'TOO_MANY_OTP_ATTEMPTS';

  constructor() {
    super('OTP invalidé : trop de tentatives');
  }
}

export class InvalidPhoneNumberError extends InvalidInputDomainError {
  readonly code = 'INVALID_PHONE_NUMBER';

  constructor() {
    super(
      'Numéro de téléphone invalide (format E.164 attendu, ex: +33612345678).',
    );
  }
}

// ─── Dépendances externes ──────────────────────────────────────────────────

export class EmailDeliveryFailedError extends ExternalServiceDomainError {
  readonly code = 'EMAIL_DELIVERY_FAILED';

  constructor(message: string) {
    super(message);
  }
}

export class SmsDeliveryFailedError extends ExternalServiceDomainError {
  readonly code = 'SMS_DELIVERY_FAILED';

  constructor(
    message = "Impossible d'envoyer le code par SMS. Réessayez dans un instant.",
  ) {
    super(message);
  }
}
