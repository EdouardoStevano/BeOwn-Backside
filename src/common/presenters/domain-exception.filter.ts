import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ConflictDomainError,
  DomainError,
  ExternalServiceDomainError,
  ForbiddenDomainError,
  InvalidInputDomainError,
  NotFoundDomainError,
  UnauthorizedDomainError,
} from '../domain/domain-error';

/**
 * Traduit les erreurs métier en réponses HTTP, à la frontière du système.
 *
 * `@Catch(DomainError)` : le filtre ne voit que les erreurs de domaine. Les
 * HttpException levées ailleurs dans l'application continuent d'être traitées
 * par le filtre par défaut de Nest — enregistrer ce filtre globalement ne change
 * donc rien au comportement des modules qui n'ont pas encore migré.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.toHttpStatus(error);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${error.code}: ${error.message}`, error.stack);
    }

    response.status(status).json({
      statusCode: status,
      code: error.code,
      message: error.message,
    });
  }

  private toHttpStatus(error: DomainError): HttpStatus {
    if (error instanceof UnauthorizedDomainError)
      return HttpStatus.UNAUTHORIZED;
    if (error instanceof ForbiddenDomainError) return HttpStatus.FORBIDDEN;
    if (error instanceof NotFoundDomainError) return HttpStatus.NOT_FOUND;
    if (error instanceof ConflictDomainError) return HttpStatus.CONFLICT;
    if (error instanceof InvalidInputDomainError) return HttpStatus.BAD_REQUEST;
    if (error instanceof ExternalServiceDomainError)
      return HttpStatus.INTERNAL_SERVER_ERROR;

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
