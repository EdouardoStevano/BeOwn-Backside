import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProjectsError, ProjectsErrorKind } from 'src/projects/domains/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<ProjectsErrorKind, HttpStatus> = {
  [ProjectsErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ProjectsErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ProjectsErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [ProjectsErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [ProjectsErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
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
 * Traduit les erreurs métier du contexte Projects en réponses HTTP.
 *
 * `@Catch(ProjectsError)` : tout le reste — `HttpException` levées par les
 * contrôleurs, erreurs inattendues — continue vers le traitement par défaut de
 * Nest. Ce filtre n'intercepte que le vocabulaire de ce domaine.
 *
 * Jumeau de `ComplianceErrorFilter`. Les statuts rendus sont ceux que les
 * `NotFoundException`, `BadRequestException` et `ConflictException` remplacées
 * rendaient déjà, à une exception documentée près — les routes
 * `/admin/sorties/:id/mark-actee` et `/cancel`, qui répondaient 400 sur une
 * sortie inconnue et répondent maintenant 404.
 */
@Catch(ProjectsError)
export class ProjectsErrorFilter implements ExceptionFilter<ProjectsError> {
  private readonly logger = new Logger(ProjectsErrorFilter.name);

  catch(error: ProjectsError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    // Une UNEXPECTED signale une dépendance en panne, pas une faute de
    // l'appelant : c'est la seule catégorie qui mérite une trace serveur.
    if (error.kind === ProjectsErrorKind.UNEXPECTED) {
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
