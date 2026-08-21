import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { TreasuryError, TreasuryErrorKind } from '../../../domain/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<TreasuryErrorKind, HttpStatus> = {
  [TreasuryErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [TreasuryErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [TreasuryErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [TreasuryErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [TreasuryErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
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
 * Traduit les erreurs métier du contexte Treasury en réponses HTTP — jumeau de
 * `SubscriptionErrorFilter`, `ReservationErrorFilter`, `CatalogErrorFilter` et
 * `ComplianceErrorFilter`.
 *
 * Les statuts et messages rendus sont ceux que les `NotFoundException` et
 * `ForbiddenException` remplacées rendaient déjà. S'y ajoute le champ `code`
 * (Annexe B du cahier des charges, §21) — `WALLET_INSUFFICIENT`,
 * `WALLET_FROZEN`, `WALLET_NOT_FOUND` — que le front peut consommer sans
 * parser les messages.
 */
@Catch(TreasuryError)
export class TreasuryErrorFilter implements ExceptionFilter<TreasuryError> {
  private readonly logger = new Logger(TreasuryErrorFilter.name);

  catch(error: TreasuryError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    if (error.kind === TreasuryErrorKind.UNEXPECTED) {
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
