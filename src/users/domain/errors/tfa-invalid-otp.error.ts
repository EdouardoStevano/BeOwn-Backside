import { DomainError } from 'src/shared/domain/errors/domain.error';

export class TfaInvalidOtpError extends DomainError {
  readonly statusCode = 401;
  constructor() {
    super('Code OTP invalide ou expiré.');
  }
}
