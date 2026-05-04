import { DomainError } from 'src/shared/domain/errors/domain.error';

export class TfaMethodConflictError extends DomainError {
  readonly statusCode = 409;
  constructor() {
    super('Une méthode de double authentification est déjà active. Désactivez-la avant d\'en activer une autre.');
  }
}
