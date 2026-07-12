/**
 * Erreur métier levée par les couches domaine et application.
 *
 * Les couches internes ne doivent connaître ni HTTP ni Nest : elles lèvent des
 * DomainError, que `DomainExceptionFilter` traduit en réponse HTTP à la
 * frontière. `code` est le discriminant stable côté client (ex. le front teste
 * `EMAIL_NOT_VERIFIED` pour rediriger vers l'écran de renvoi de lien).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** L'appelant n'est pas authentifié, ou ses identifiants sont invalides. → 401 */
export abstract class UnauthorizedDomainError extends DomainError {}

/** L'appelant est authentifié mais n'a pas le droit d'agir. → 403 */
export abstract class ForbiddenDomainError extends DomainError {}

/** La ressource visée n'existe pas. → 404 */
export abstract class NotFoundDomainError extends DomainError {}

/** L'état actuel interdit l'opération (doublon, transition invalide…). → 409 */
export abstract class ConflictDomainError extends DomainError {}

/** L'entrée viole une règle métier. → 400 */
export abstract class InvalidInputDomainError extends DomainError {}

/** Une dépendance externe (mail, SMS…) a échoué. → 500 */
export abstract class ExternalServiceDomainError extends DomainError {}
