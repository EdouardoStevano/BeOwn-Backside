import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PreferencesError,
  PreferencesErrorKind,
} from 'src/preferences/domains/errors/preferences.error';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<PreferencesErrorKind, HttpStatus> = {
  [PreferencesErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [PreferencesErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
};

const ERROR_LABEL: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.CONFLICT]: 'Conflict',
};

/**
 * Traduit les erreurs métier du contexte Preferences en réponses HTTP, sur le
 * même modèle que `ProfilesErrorFilter` : le corps reprend le trio que Nest
 * produit pour une `HttpException`, augmenté du `code` et des `details`.
 */
@Catch(PreferencesError)
export class PreferencesErrorFilter implements ExceptionFilter<PreferencesError> {
  catch(error: PreferencesError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    response.status(status).json({
      message: error.message,
      error: ERROR_LABEL[status] ?? 'Error',
      statusCode: status,
      ...(error.code !== undefined && { code: error.code }),
      ...error.details,
    });
  }
}
