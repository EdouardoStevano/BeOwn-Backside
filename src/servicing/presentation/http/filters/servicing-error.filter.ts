import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ServicingError, ServicingErrorKind } from '../../../domain/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<ServicingErrorKind, HttpStatus> = {
  [ServicingErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ServicingErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ServicingErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [ServicingErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [ServicingErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
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
 * Traduit les erreurs métier du contexte Servicing en réponses HTTP — jumeau
 * de `SubscriptionErrorFilter`, `ReservationErrorFilter`, `CatalogErrorFilter`,
 * `ComplianceErrorFilter` et `TreasuryErrorFilter`.
 *
 * Les statuts et les codes rendus sont exactement ceux que le filtre de
 * Subscription rendait pour les mêmes échéances avant l'extraction : le
 * déménagement du contexte ne change aucune réponse d'API.
 */
@Catch(ServicingError)
export class ServicingErrorFilter implements ExceptionFilter<ServicingError> {
  private readonly logger = new Logger(ServicingErrorFilter.name);

  catch(error: ServicingError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    if (error.kind === ServicingErrorKind.UNEXPECTED) {
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
