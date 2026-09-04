import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ConflitsInteretsError,
  ConflitsInteretsErrorKind,
} from 'src/projects/domains/errors/conflits-interets.errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
export const STATUS_BY_KIND: Record<ConflitsInteretsErrorKind, HttpStatus> = {
  [ConflitsInteretsErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ConflitsInteretsErrorKind.CONFLICT]: HttpStatus.CONFLICT,
};

/**
 * Statut HTTP qu'une `ConflitsInteretsError` recevra — fonction PURE, exportée.
 *
 * Même raison qu'ailleurs dans le dépôt : `AuditInterceptor` s'exécute AVANT ce
 * filtre et doit journaliser le statut réellement envoyé. Sans cette fonction
 * partagée, un refus 403 de conflit d'intérêts — journal conservé cinq ans —
 * s'écrirait « 500 » alors que le client, lui, reçoit un 403.
 */
export const statutHttpDeConflitsInteretsError = (
  error: ConflitsInteretsError,
): HttpStatus => STATUS_BY_KIND[error.kind];

/** Libellé `error` que Nest ajoute quand on lui passe un message texte. */
const ERROR_LABEL: Record<number, string> = {
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.CONFLICT]: 'Conflict',
};

/**
 * Traduit les refus de conflit d'intérêts en réponses HTTP.
 *
 * Enregistré globalement (`APP_FILTER` dans `ConflitsInteretsModule`) : la
 * règle est branchée sur sept use cases répartis dans quatre modules, et un
 * `@UseFilters` par contrôleur laisserait le premier oubli renvoyer un 500 sur
 * un refus parfaitement normal.
 *
 * Aucune trace d'exécution ni détail interne ne sort : le corps se limite au
 * trio standard, augmenté du `code` (contrat du front).
 */
@Catch(ConflitsInteretsError)
export class ConflitsInteretsErrorFilter
  implements ExceptionFilter<ConflitsInteretsError>
{
  catch(error: ConflitsInteretsError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = statutHttpDeConflitsInteretsError(error);

    response.status(status).json({
      message: error.message,
      error: ERROR_LABEL[status] ?? 'Error',
      statusCode: status,
      code: error.code,
      ...error.details,
    });
  }
}
