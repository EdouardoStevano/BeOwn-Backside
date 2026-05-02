import { DomainError } from 'src/shared/domain/errors/domain.error';

export class InvalidCredentialsError extends DomainError {
  readonly statusCode = 401;

  constructor() {
    super('Identifiants invalides.');
  }
}