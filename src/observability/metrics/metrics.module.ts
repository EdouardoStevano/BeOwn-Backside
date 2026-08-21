import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsPort } from './metrics.port';
import { PrometheusMetricsAdapter } from './prometheus-metrics.adapter';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsController } from './metrics.controller';

/**
 * Module d'observabilité métriques (DIP + @Global).
 *
 * - `@Global` : n'importe quel use case / controller peut injecter
 *   `MetricsPort` sans réimporter ce module (le port est le seul point de
 *   couplage des couches métier — jamais prom-client).
 * - Le token d'injection est la classe abstraite `MetricsPort` ; l'unique
 *   implémentation est `PrometheusMetricsAdapter` (singleton — un seul Registry
 *   par process, indispensable pour l'agrégation des compteurs).
 * - `PrometheusMetricsAdapter` est AUSSI fourni sous son propre type pour le
 *   `MetricsController` (accès `registry`/`scrape`) — même instance singleton.
 * - L'interceptor RED est enregistré globalement ici (`APP_INTERCEPTOR`).
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    PrometheusMetricsAdapter,
    { provide: MetricsPort, useExisting: PrometheusMetricsAdapter },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [MetricsPort, PrometheusMetricsAdapter],
})
export class MetricsModule {}
