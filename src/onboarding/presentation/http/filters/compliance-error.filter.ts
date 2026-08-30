import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ComplianceError, ComplianceErrorKind } from 'src/onboarding/domain/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<ComplianceErrorKind, HttpStatus> = {
  [ComplianceErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ComplianceErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ComplianceErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [ComplianceErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [ComplianceErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
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
 * Traduit les erreurs métier du contexte KYC en réponses HTTP.
 *
 * `@Catch(ComplianceError)` : tout le reste — `HttpException` levées par les
 * contrôleurs, erreurs inattendues — continue vers le traitement par défaut de
 * Nest. Ce filtre n'intercepte que le vocabulaire de ce domaine.
 *
 * Jumeau de `ProfilesErrorFilter`, qui rendait jusqu'ici le 409 de
 * `KycPasEnRevueManuelleError` : le corps de réponse est identique, `code`
 * compris.
 */
@Catch(ComplianceError)
export class ComplianceErrorFilter implements ExceptionFilter<ComplianceError> {
  private readonly logger = new Logger(ComplianceErrorFilter.name);

  catch(error: ComplianceError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    // Une UNEXPECTED signale une dépendance en panne, pas une faute de
    // l'appelant : c'est la seule catégorie qui mérite une trace serveur.
    if (error.kind === ComplianceErrorKind.UNEXPECTED) {
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
