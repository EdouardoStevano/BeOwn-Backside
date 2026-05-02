import { DomainError } from 'src/shared/domain/errors/domain.error';

export class EmailNotVerifiedError extends DomainError {
  readonly statusCode = 401;

  constructor() {
    super('Email non vérifié. Veuillez confirmer votre email avant de vous connecter.');
  }
}