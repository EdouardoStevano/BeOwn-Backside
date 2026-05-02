import { DomainError } from 'src/shared/domain/errors/domain.error';

export class UserAlreadyExistsError extends DomainError {
  readonly statusCode = 409;

  constructor(email: string) {
    super(`Un compte avec l'email ${email} existe déjà.`);
  }
}
