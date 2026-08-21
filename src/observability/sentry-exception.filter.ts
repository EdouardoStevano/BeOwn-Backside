import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Sentry } from './sentry';

/**
 * Filtre d'exception global qui capture vers Sentry AVANT de laisser Nest
 * produire sa réponse d'erreur habituelle.
 *
 * Étend `BaseExceptionFilter` pour NE PAS réinventer le formatage d'erreur de
 * Nest : on capture puis on délègue à `super.catch` (réponse identique à
 * l'existant — aucun changement de contrat côté front).
 *
 * On n'envoie à Sentry que le SIGNAL utile : les vraies erreurs serveur (5xx et
 * exceptions non-HTTP). Les 4xx (validation, 401, 403, 404…) sont du trafic
 * client normal — les envoyer noierait Sentry et fausserait le taux d'erreur.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (this.shouldReport(exception)) {
      Sentry.captureException(exception);
    }
    super.catch(exception, host);
  }

  private shouldReport(exception: unknown): boolean {
    if (exception instanceof HttpException) {
      return exception.getStatus() >= 500;
    }
    // Toute exception non-HTTP = bug/incident serveur → à remonter.
    return true;
  }
}
