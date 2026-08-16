import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProfilesError, ProfilesErrorKind } from 'src/profiles/domains/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<ProfilesErrorKind, HttpStatus> = {
  [ProfilesErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ProfilesErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ProfilesErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [ProfilesErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [ProfilesErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
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
 * Traduit les erreurs métier du contexte Profiles en réponses HTTP.
 *
 * `@Catch(ProfilesError)` : tout le reste — `HttpException` levées par les
 * contrôleurs, erreurs inattendues — continue vers le traitement par défaut de
 * Nest. Ce filtre n'intercepte que le vocabulaire du domaine.
 *
 * Le corps reprend le trio que Nest produit pour une `HttpException`
 * construite avec un message texte, augmenté du `code` et des `details`. Les
 * réponses existantes ne perdent donc aucune clé : `ConflictException('Profil
 * PP déjà existant.')` rendait `{statusCode, message, error}`, on y ajoute
 * `code` et, pour une donnée refusée, le `field` fautif — de quoi surligner
 * l'entrée du formulaire sans parser le message.
 */
@Catch(ProfilesError)
export class ProfilesErrorFilter implements ExceptionFilter<ProfilesError> {
  private readonly logger = new Logger(ProfilesErrorFilter.name);

  catch(error: ProfilesError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    // Une UNEXPECTED signale une dépendance en panne, pas une faute de
    // l'appelant : c'est la seule catégorie qui mérite une trace serveur.
    if (error.kind === ProfilesErrorKind.UNEXPECTED) {
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
