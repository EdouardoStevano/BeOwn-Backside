import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AccountClosedError,
  AccountDeletionBlockedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  IamError,
  IamErrorKind,
  InvalidRefreshTokenError,
} from 'src/iam/domain/errors';

/** Seule table qui connaît HTTP : le domaine ignore ces statuts. */
const STATUS_BY_KIND: Record<IamErrorKind, HttpStatus> = {
  [IamErrorKind.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [IamErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [IamErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [IamErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [IamErrorKind.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [IamErrorKind.UNEXPECTED]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Libellé `error` que Nest ajoute quand on lui passe un message texte. */
const ERROR_LABEL: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
};

/**
 * Corps « historiques » : trois flux renvoyaient déjà une forme particulière
 * avant l'introduction des erreurs de domaine, et le front matche dessus.
 * Elles sont mutuellement incohérentes (l'une omet `statusCode`, l'autre
 * l'inclut, la troisième n'a pas de `message`) — c'est assumé, l'uniformiser
 * casserait des écrans en production. Toute NOUVELLE erreur passe par la
 * forme standard plus bas ; cette table ne doit pas s'allonger.
 */
const LEGACY_BODIES = new Map<
  Function,
  (error: IamError) => Record<string, unknown>
>([
  [EmailNotVerifiedError, (e) => ({ code: e.code, message: e.message })],
  [
    AccountDeletionBlockedError,
    (e) => ({ code: e.code, blockers: e.details?.blockers }),
  ],
  // `new UnauthorizedException()` sans argument ne produisait pas de clé `error`.
  [InvalidRefreshTokenError, (e) => ({ message: e.message, statusCode: 401 })],
]);

/** AccountSuspended/Closed partagent la même forme `{statusCode, message, code}`. */
const withStatusCodeAndCode = (e: IamError, status: number) => ({
  statusCode: status,
  message: e.message,
  code: e.code,
});

/**
 * Traduit les erreurs métier IAM en réponses HTTP.
 *
 * `@Catch(IamError)` : tout le reste (HttpException levées par les
 * contrôleurs, erreurs inattendues) continue vers le traitement par défaut de
 * Nest — ce filtre n'intercepte que le vocabulaire du domaine.
 */
@Catch(IamError)
export class IamErrorFilter implements ExceptionFilter<IamError> {
  private readonly logger = new Logger(IamErrorFilter.name);

  catch(error: IamError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    // Une UNEXPECTED signale une dépendance en panne, pas une faute de
    // l'appelant : c'est la seule catégorie qui mérite une trace serveur.
    if (error.kind === IamErrorKind.UNEXPECTED) {
      this.logger.error(`${error.name}: ${error.message}`, error.stack);
    }

    response.status(status).json(this.body(error, status));
  }

  private body(error: IamError, status: number): Record<string, unknown> {
    const legacy = LEGACY_BODIES.get(error.constructor);
    if (legacy) return legacy(error);

    if (
      error instanceof AccountSuspendedError ||
      error instanceof AccountClosedError
    ) {
      return withStatusCodeAndCode(error, status);
    }

    // Forme standard : le trio que Nest produit pour une HttpException
    // construite avec un message texte, augmenté du `code` et des `details`
    // quand l'erreur en porte.
    //
    // Ces deux-là étaient jusqu'ici perdus en route — `IamError` les déclare
    // comme « contrat stable consommé par le front », et seules les entrées de
    // LEGACY_BODIES les publiaient. `MfaRequiredError` a besoin de faire
    // voyager son `challengeId` : sans lui, l'appelant apprend qu'un second
    // facteur manque sans savoir contre quoi le prouver. Ce sont des clés en
    // plus, jamais en moins — aucun front qui lit `message`/`statusCode` n'en
    // pâtit.
    return {
      message: error.message,
      error: ERROR_LABEL[status] ?? 'Error',
      statusCode: status,
      ...(error.code !== undefined && { code: error.code }),
      // Étalé à la racine, comme `blockers` l'est déjà pour la suppression de
      // compte. À chaque erreur de choisir des clés qui n'entrent pas en
      // collision avec le trio ci-dessus.
      ...error.details,
    };
  }
}
