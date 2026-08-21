import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from 'src/common/auth/public.decorator';
import { PrometheusMetricsAdapter } from './prometheus-metrics.adapter';

/**
 * Endpoint d'exposition Prometheus scrappé par Grafana Alloy DANS le cluster.
 *
 * Défense en profondeur (2 couches) :
 *  1. Réseau — le Service ne publie `/metrics` qu'en ClusterIP et une
 *     `NetworkPolicy` (k8s/monitoring/networkpolicy.yaml) limite qui peut
 *     joindre le pod sur le port 8080 (ingress + Alloy uniquement). Cette
 *     couche opère au niveau IP/port, PAS au niveau chemin HTTP (`/metrics`
 *     partage le port 8080 avec le reste de l'API) : elle réduit la surface
 *     réseau mais n'isole pas `/metrics` d'un autre chemin.
 *  2. Jeton — si `METRICS_TOKEN` est défini, un `Authorization: Bearer
 *     <token>` valide est exigé (comparaison à temps constant). C'est la
 *     couche qui protège réellement `/metrics` au niveau applicatif : en
 *     PRODUCTION (`NODE_ENV=production`) elle est OBLIGATOIRE — un jeton
 *     absent fait échouer fermé (403), car la NetworkPolicy seule ne peut
 *     pas garantir l'isolation du endpoint (OBS-1). Hors production, un
 *     jeton absent retombe sur la NetworkPolicy (confort de dev/staging).
 *
 * `@Public` : contourne le JwtAuthGuard global (Alloy n'a pas de session
 * utilisateur). `@SkipThrottle` : le scrape régulier ne doit pas consommer le
 * budget de rate-limiting. Exclu de Swagger (surface interne).
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly adapter: PrometheusMetricsAdapter,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @SkipThrottle({ short: true, medium: true, auth: true })
  @Header('Cache-Control', 'no-store')
  @Get()
  async scrape(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    this.assertAuthorized(authorization);
    res.setHeader('Content-Type', this.adapter.contentType);
    res.send(await this.adapter.scrape());
  }

  private assertAuthorized(authorization: string | undefined): void {
    const expected = this.config.get<string>('METRICS_TOKEN');
    if (!expected) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        // OBS-1 : fail-closed en prod — la NetworkPolicy seule ne protège pas
        // le chemin `/metrics` (port partagé avec l'API), donc un jeton
        // absent en production ne doit JAMAIS retomber sur un accès public.
        throw new ForbiddenException(
          'METRICS_TOKEN doit être configuré en production.',
        );
      }
      return; // hors production : confort dev/staging, NetworkPolicy seule
    }

    const provided = (authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!this.constantTimeEquals(provided, expected)) {
      throw new ForbiddenException('Accès au endpoint /metrics refusé.');
    }
  }

  /** Comparaison à temps constant (évite un oracle temporel sur le jeton). */
  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }
}
