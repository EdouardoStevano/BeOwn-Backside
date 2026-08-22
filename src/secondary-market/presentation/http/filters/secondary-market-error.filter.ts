import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  SecondaryMarketError,
  SecondaryMarketErrorKind,
} from '../../../domain/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<SecondaryMarketErrorKind, HttpStatus> = {
  [SecondaryMarketErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [SecondaryMarketErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [SecondaryMarketErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [SecondaryMarketErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [SecondaryMarketErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
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
 * Traduit les erreurs métier du contexte Secondary Market en réponses HTTP —
 * jumeau de `SubscriptionErrorFilter`, `ServicingErrorFilter`,
 * `ReservationErrorFilter`, `CatalogErrorFilter`, `ComplianceErrorFilter` et
 * `TreasuryErrorFilter`.
 *
 * Les messages rendus sont ceux que les `BadRequestException`,
 * `ForbiddenException` et `NotFoundException` remplacées portaient. S'y ajoute
 * le champ `code` (§21) — `ORDER_NOT_AVAILABLE`, `FRACTIONS_UNAVAILABLE`,
 * `WALLET_INSUFFICIENT`… — que le front peut consommer sans parser les
 * messages.
 *
 * Une nuance de statut change, et elle est voulue, la même que celle déjà
 * actée par les contextes voisins : les transitions impossibles (acheter un
 * ordre qui n'est plus au carnet, annuler un ordre déjà exécuté) répondent
 * **409 Conflict** là où elles répondaient 400.
 */
@Catch(SecondaryMarketError)
export class SecondaryMarketErrorFilter implements ExceptionFilter<SecondaryMarketError> {
  private readonly logger = new Logger(SecondaryMarketErrorFilter.name);

  catch(error: SecondaryMarketError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    if (error.kind === SecondaryMarketErrorKind.UNEXPECTED) {
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
