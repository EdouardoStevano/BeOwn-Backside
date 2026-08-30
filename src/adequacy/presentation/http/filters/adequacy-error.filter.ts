import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdequacyError, AdequacyErrorKind } from 'src/adequacy/domain/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<AdequacyErrorKind, HttpStatus> = {
  [AdequacyErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [AdequacyErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [AdequacyErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [AdequacyErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [AdequacyErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
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
 * Traduit les erreurs métier de l'adéquation en réponses HTTP.
 *
 * `@Catch(AdequacyError)` : tout le reste — `HttpException` levées par les
 * contrôleurs, erreurs inattendues — continue vers le traitement par défaut de
 * Nest. Ce filtre n'intercepte que le vocabulaire de ce domaine.
 *
 * **Le corps produit est identique à celui de `ComplianceErrorFilter`**, `code`
 * compris : les mêmes erreurs sortaient par lui avant la scission des deux
 * contextes, et le front ne doit pas s'apercevoir qu'elles ont changé de
 * dossier. Deux filtres plutôt qu'un parce que chaque contexte porte son socle
 * d'erreurs (§25) ; le tableau de correspondance, lui, est volontairement le
 * même partout — une traduction qui différerait d'un contexte à l'autre serait
 * une source d'erreur pour l'appelant.
 */
@Catch(AdequacyError)
export class AdequacyErrorFilter implements ExceptionFilter<AdequacyError> {
  private readonly logger = new Logger(AdequacyErrorFilter.name);

  catch(error: AdequacyError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    // Une UNEXPECTED signale une dépendance en panne, pas une faute de
    // l'appelant : c'est la seule catégorie qui mérite une trace serveur.
    if (error.kind === AdequacyErrorKind.UNEXPECTED) {
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
