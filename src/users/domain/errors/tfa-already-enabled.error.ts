import { DomainError } from 'src/shared/domain/errors/domain.error';

export class TfaAlreadyEnabledError extends DomainError {
  readonly statusCode = 409;
  constructor() {
    super('La double authentification par email est déjà activée.');
  }
}
