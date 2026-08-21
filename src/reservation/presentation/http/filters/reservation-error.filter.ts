import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ReservationError,
  ReservationErrorKind,
} from '../../../domain/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<ReservationErrorKind, HttpStatus> = {
  [ReservationErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ReservationErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ReservationErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [ReservationErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [ReservationErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Libellé `error` que Nest ajoute quand on lui passe un message texte. */
const ERROR_LABEL: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
};

/**
 * Traduit les erreurs métier du contexte Reservation en réponses HTTP —
 * jumeau de `CatalogErrorFilter` et `ComplianceErrorFilter`.
 *
 * Les statuts et les messages rendus sont ceux que les `NotFoundException` et
 * `BadRequestException` remplacées rendaient déjà : aucune réponse ne change.
 * S'y ajoute le champ `code` (Annexe B du cahier des charges, §21) —
 * `PROJECT_NOT_OPEN`, `RESERVATION_FULL`, `TICKET_BELOW_MIN`… — que le front
 * peut consommer sans parser les messages.
 */
@Catch(ReservationError)
export class ReservationErrorFilter
  implements ExceptionFilter<ReservationError>
{
  private readonly logger = new Logger(ReservationErrorFilter.name);

  catch(error: ReservationError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    if (error.kind === ReservationErrorKind.UNEXPECTED) {
      this.logger.error(`${error.name}: ${error.message}`, error.stack);
    }

    response.status(status).json({
      message: error.message,
      error: ERROR_LABEL[status] ?? 'Error',
      statusCode: status,
      ...(error.code !== undefined && { code: error.code }),
      ...error.details,
    });
  }
}
