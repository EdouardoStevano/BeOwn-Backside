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
 *  2. Jeton — un `Authorization: Bearer <token>` valide est exigé
 *     (comparaison à temps constant). C'est la couche qui protège réellement
 *     `/metrics` au niveau applicatif : la NetworkPolicy opère au niveau
 *     IP/port et ne peut pas isoler un chemin HTTP (OBS-1).
 *
 *     Le jeton est OBLIGATOIRE PARTOUT, sauf `NODE_ENV=development`
 *     explicitement déclaré. La règle précédente n'exemptait que la
 *     production : tout environnement non nommé « production » — staging,
 *     recette, préproduction, et surtout un déploiement où `NODE_ENV` n'est
 *     tout simplement pas positionné — servait donc `/metrics` en accès libre.
 *     Or ces métriques décrivent la plateforme : volumes de souscription,
 *     backlog KYC, taux d'échec de paiement. Un environnement oublié est le
 *     cas le PLUS probable, pas le moins : le défaut doit lui être fermé.
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
      // Fail-closed par DÉFAUT : seule une déclaration explicite
      // `NODE_ENV=development` dispense du jeton (confort de poste de
      // travail). Tout le reste — staging, recette, production, ou un
      // `NODE_ENV` absent — exige le jeton.
      const nodeEnv = (this.config.get<string>('NODE_ENV') ?? '')
        .trim()
        .toLowerCase();
      if (nodeEnv !== 'development') {
        throw new ForbiddenException(
          'METRICS_TOKEN doit être configuré hors développement local.',
        );
      }
      return;
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
