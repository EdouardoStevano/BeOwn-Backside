import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PorteurAccessError,
  PorteurAccessErrorKind,
} from 'src/porteur-access/domains/errors/porteur-access.errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<PorteurAccessErrorKind, HttpStatus> = {
  [PorteurAccessErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [PorteurAccessErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [PorteurAccessErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [PorteurAccessErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [PorteurAccessErrorKind.TOO_MANY_REQUESTS]: HttpStatus.TOO_MANY_REQUESTS,
};

/** Libellé `error` que Nest ajoute quand on lui passe un message texte. */
const ERROR_LABEL: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
};

/**
 * Traduit les erreurs métier de l'accès porteur en réponses HTTP, sur le
 * modèle de `IamErrorFilter`.
 *
 * `@Catch(PorteurAccessError)` : tout le reste continue vers le traitement par
 * défaut de Nest. Aucune trace d'exécution ni détail interne ne sort — le
 * corps se limite au trio standard, augmenté du `code` (contrat du front) et
 * des `details` que l'erreur porte volontairement.
 */
@Catch(PorteurAccessError)
export class PorteurAccessErrorFilter implements ExceptionFilter<PorteurAccessError> {
  catch(error: PorteurAccessError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    response.status(status).json({
      message: error.message,
      error: ERROR_LABEL[status] ?? 'Error',
      statusCode: status,
      code: error.code,
      ...error.details,
    });
  }
}
