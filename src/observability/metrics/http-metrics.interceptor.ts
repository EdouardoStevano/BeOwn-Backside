import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { MetricsPort } from './metrics.port';
import { METRIC } from './metric-names';

/**
 * Interceptor RED global : émet `beown_http_requests_total` et
 * `beown_http_request_duration_seconds` pour CHAQUE requête HTTP (succès ET
 * erreur), branché en `APP_INTERCEPTOR` (voir MetricsModule).
 *
 * ⚠ CARDINALITÉ : le label `route` est le TEMPLATE de route (ex.
 * `/secondary-market/orders/:id/execute`), reconstruit depuis les métadonnées
 * Nest du contrôleur et du handler — JAMAIS `req.url` (qui contient les IDs
 * concrets et ferait exploser la cardinalité Prometheus). `status_class` est
 * borné à 2xx/3xx/4xx/5xx.
 *
 * Ne dépend que du `MetricsPort` (DIP) : aucun import prom-client ici.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsPort) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Ne s'applique qu'au transport HTTP (ignore WebSocket / RPC).
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<{ method?: string; route?: { path?: string } }>();
    const res = http.getResponse<{ statusCode?: number }>();

    const method = (req.method ?? 'GET').toUpperCase();
    const route = this.resolveRouteTemplate(context, req);
    const start = process.hrtime.bigint();

    const record = (statusCode: number): void => {
      const labels = {
        method,
        route,
        status_class: this.statusClass(statusCode),
      };
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.incrementCounter(METRIC.HTTP_REQUESTS_TOTAL, labels);
      this.metrics.observeHistogram(
        METRIC.HTTP_REQUEST_DURATION_SECONDS,
        durationSeconds,
        labels,
      );
    };

    return next.handle().pipe(
      tap(() => record(res.statusCode ?? 200)),
      catchError((err: unknown) => {
        record(this.errorStatus(err));
        return throwError(() => err);
      }),
    );
  }

  /**
   * Template de route à faible cardinalité, reconstruit depuis les métadonnées
   * Nest (chemin du contrôleur + chemin du handler). Repli sur `req.route.path`
   * (fourni par Express, déjà templatisé) puis sur `unknown` — jamais `req.url`.
   */
  private resolveRouteTemplate(
    context: ExecutionContext,
    req: { route?: { path?: string } },
  ): string {
    const controllerPath = this.firstPath(
      Reflect.getMetadata(PATH_METADATA, context.getClass()),
    );
    const handlerPath = this.firstPath(
      Reflect.getMetadata(PATH_METADATA, context.getHandler()),
    );

    const combined = `/${controllerPath}/${handlerPath}`
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '');

    if (combined && combined !== '/') return combined;
    if (req.route?.path) return req.route.path;
    return 'unknown';
  }

  private firstPath(value: unknown): string {
    if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
    return typeof value === 'string' ? value : '';
  }

  private statusClass(statusCode: number): string {
    if (statusCode >= 500) return '5xx';
    if (statusCode >= 400) return '4xx';
    if (statusCode >= 300) return '3xx';
    return '2xx';
  }

  private errorStatus(err: unknown): number {
    const candidate = err as { getStatus?: () => number; status?: number };
    if (typeof candidate?.getStatus === 'function') {
      const s = candidate.getStatus();
      if (typeof s === 'number') return s;
    }
    if (typeof candidate?.status === 'number') return candidate.status;
    return 500;
  }
}
