import { DomainError } from 'src/shared/domain/errors/domain.error';

export class UserNotFoundError extends DomainError {
  readonly statusCode = 404;

  constructor() {
    super('Utilisateur introuvable.');
  }
}