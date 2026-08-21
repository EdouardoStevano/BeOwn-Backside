import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  SubscriptionError,
  SubscriptionErrorKind,
} from '../../../domain/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<SubscriptionErrorKind, HttpStatus> = {
  [SubscriptionErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [SubscriptionErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [SubscriptionErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [SubscriptionErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [SubscriptionErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
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
 * Traduit les erreurs métier du contexte Subscription en réponses HTTP —
 * jumeau de `ReservationErrorFilter`, `CatalogErrorFilter` et
 * `ComplianceErrorFilter`.
 *
 * Les messages rendus sont ceux que les `BadRequestException`,
 * `ForbiddenException` et `NotFoundException` remplacées portaient. S'y ajoute
 * le champ `code` (Annexe B du cahier des charges, §21) —
 * `TICKET_ABOVE_MAX`, `WALLET_INSUFFICIENT`, `PROJECT_NOT_OPEN`… — que le
 * front peut consommer sans parser les messages.
 *
 * Une nuance de statut change, et elle est voulue : les transitions
 * impossibles (rétracter un investissement déjà rétracté, payer une échéance
 * déjà payée) répondent désormais **409 Conflict** là où elles répondaient
 * 400. C'est le sens de `CONFLICT` — l'appelant n'a rien à corriger dans sa
 * requête, c'est l'état de la ressource qui a bougé — et l'alignement sur les
 * contextes déjà refactorés.
 */
@Catch(SubscriptionError)
export class SubscriptionErrorFilter implements ExceptionFilter<SubscriptionError> {
  private readonly logger = new Logger(SubscriptionErrorFilter.name);

  catch(error: SubscriptionError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    if (error.kind === SubscriptionErrorKind.UNEXPECTED) {
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
