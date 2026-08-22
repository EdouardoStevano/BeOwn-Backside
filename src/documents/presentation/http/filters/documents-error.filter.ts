import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsError, DocumentsErrorKind } from '../../../domain/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<DocumentsErrorKind, HttpStatus> = {
  [DocumentsErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [DocumentsErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [DocumentsErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [DocumentsErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [DocumentsErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
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
 * Traduit les erreurs métier du contexte Documents en réponses HTTP — jumeau
 * des filtres de Subscription, Servicing, Secondary Market, Reservation,
 * Catalog, Compliance et Treasury.
 *
 * Les messages et les statuts rendus sont ceux des exceptions Nest remplacées,
 * au caractère près. S'y ajoute le champ `code` (§21) —
 * `NOT_A_PROJECT_PHOTO`, `MISSING_PROJECT_ID`, `SIGNATURE_NOT_PENDING`… — que
 * le front peut consommer sans parser les messages.
 */
@Catch(DocumentsError)
export class DocumentsErrorFilter implements ExceptionFilter<DocumentsError> {
  private readonly logger = new Logger(DocumentsErrorFilter.name);

  catch(error: DocumentsError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    if (error.kind === DocumentsErrorKind.UNEXPECTED) {
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
