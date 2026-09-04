import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PayoutMethodError,
  type PayoutMethodErrorCode,
} from '../../applications/ports/payout-methods.port';

/**
 * Traduit les erreurs métier `PayoutMethodError` en réponses HTTP.
 *
 * Le domaine ignore le protocole : il lève un code stable, la correspondance
 * HTTP est décidée ICI, en un seul endroit. Ajouter un cas d'erreur = une ligne
 * dans la table, aucun `switch` à faire grossir dans les contrôleurs (OCP).
 *
 * Un code par statut, quelle que soit la route : le front peut brancher son
 * affichage sur `code` sans se soucier de l'endpoint appelé.
 */
export const HTTP_STATUS_BY_CODE: Record<PayoutMethodErrorCode, HttpStatus> = {
  CONNECT_NOT_READY: HttpStatus.CONFLICT,
  CANNOT_DELETE_DEFAULT: HttpStatus.CONFLICT,
  NO_PAYOUT_METHOD: HttpStatus.UNPROCESSABLE_ENTITY,
  CARD_NOT_INSTANT_ELIGIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  CARD_REJECTED: HttpStatus.UNPROCESSABLE_ENTITY,
  AMOUNT_OUT_OF_RANGE: HttpStatus.UNPROCESSABLE_ENTITY,
};

/**
 * Statut HTTP qu'une `PayoutMethodError` recevra — fonction PURE, exportée
 * pour que l'intercepteur d'audit (qui s'exécute AVANT ce filtre) journalise
 * le statut réellement envoyé au client plutôt qu'un 500 par défaut.
 */
export const statutHttpDePayoutMethodError = (
  error: PayoutMethodError,
): HttpStatus =>
  HTTP_STATUS_BY_CODE[error.code] ?? HttpStatus.UNPROCESSABLE_ENTITY;

@Catch(PayoutMethodError)
export class PayoutMethodExceptionFilter implements ExceptionFilter {
  catch(error: PayoutMethodError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode = statutHttpDePayoutMethodError(error);

    // `message` est rédigé pour l'utilisateur final (français, sans détail
    // technique) ; la cause Stripe brute reste dans les logs de l'adaptateur.
    response.status(statusCode).json({
      statusCode,
      code: error.code,
      message: error.message,
    });
  }
}
