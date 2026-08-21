import {
  Controller,
  Get,
  Logger,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from 'src/common/auth/public.decorator';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

/**
 * Sondes de santé distinctes (correctif du /health trivial qui renvoyait
 * toujours `{status:'ok'}` sans tester Postgres/Redis — la readinessProbe
 * « mentait » : k8s routait du trafic chemin-argent vers un pod dont la base
 * était morte).
 *
 *  - GET /health/live  : LIVENESS. Le processus répond → OK. Ne teste AUCUNE
 *    dépendance externe : un incident Postgres/Redis ne doit PAS faire
 *    redémarrer le pod (sinon on transforme une panne de dépendance en
 *    crash-loop). C'est la cible de la livenessProbe k8s.
 *  - GET /health/ready : READINESS. Teste Postgres (SELECT 1). Postgres est la
 *    dépendance dure : sans elle le pod ne peut rien servir → 503, l'ingress le
 *    retire du service. Redis est testé aussi mais NON bloquant (voir plus bas).
 *  - GET /health       : compat historique, mappé sur la liveness.
 *
 * Décision d'architecture — Redis non bloquant pour la readiness :
 *   Redis porte le rate-limiting (fail-open), l'idempotence OTP et les sessions
 *   de refresh token — l'API reste partiellement fonctionnelle sans lui. Le
 *   faire 503 dans la readiness transformerait un simple à-coup Redis en panne
 *   TOTALE de la plateforme (plus aucun pod « ready »). On rapporte donc l'état
 *   Redis (champ `redis` + log warn) sans retirer le pod du service. Une équipe
 *   qui préfère un comportement strict peut faire lever le 503 sur Redis aussi.
 *
 * Toutes @Public (contournent le JwtAuthGuard global) et @SkipThrottle (les
 * sondes k8s ne doivent pas consommer le budget de rate-limiting).
 *
 * `beown_dependency_up{dependency}` (jauge, via `MetricsPort` — DIP, jamais
 * d'import prom-client ici) est mise à jour à chaque appel de `/health/ready`,
 * ce qui alimente l'alerte `ApiDependencyDown` côté Grafana.
 */
@ApiTags('Health')
@Controller('health')
@SkipThrottle({ short: true, medium: true, auth: true })
export class HealthController implements OnApplicationShutdown {
  private readonly logger = new Logger(HealthController.name);

  /**
   * Client Redis dédié aux sondes (mirror du pattern RedisThrottlerStorage) :
   * connexion réutilisée entre requêtes, échec rapide (pas de file d'attente
   * offline) pour ne jamais faire traîner une sonde.
   */
  private readonly redis: Redis;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly metrics: MetricsPort,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    this.redis.on('error', (err) => {
      // Journalisé au niveau debug : la santé réelle est mesurée à la demande
      // dans /health/ready, pas sur ce flux d'événements.
      this.logger.debug(`Redis (sonde santé) : ${err.message}`);
    });
  }

  @ApiOperation({ summary: 'Liveness — le processus répond' })
  @ApiResponse({ status: 200, description: 'Processus vivant' })
  @Public()
  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @ApiExcludeEndpoint()
  @Public()
  @Get()
  check() {
    // Compat historique : /health == liveness.
    return this.live();
  }

  @ApiOperation({
    summary: 'Readiness — Postgres joignable (Redis rapporté, non bloquant)',
    description:
      'Renvoie 503 si Postgres (SELECT 1) est indisponible. Redis est testé (PING) et rapporté sans bloquer la readiness. Cible de la readinessProbe k8s.',
  })
  @ApiResponse({ status: 200, description: 'Prêt à recevoir du trafic' })
  @ApiResponse({ status: 503, description: 'Postgres indisponible' })
  @Public()
  @Get('ready')
  async ready() {
    const [postgresUp, redisUp] = await Promise.all([
      this.pingPostgres(),
      this.pingRedis(),
    ]);

    if (!redisUp) {
      this.logger.warn(
        'Readiness : Redis injoignable — pod maintenu dans le service (dépendance dégradée non bloquante).',
      );
    }

    this.metrics.setGauge(METRIC.DEPENDENCY_UP, postgresUp ? 1 : 0, {
      dependency: 'postgres',
    });
    this.metrics.setGauge(METRIC.DEPENDENCY_UP, redisUp ? 1 : 0, {
      dependency: 'redis',
    });

    const body = {
      status: postgresUp ? 'ok' : 'unavailable',
      timestamp: new Date().toISOString(),
      dependencies: {
        postgres: postgresUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
      },
    };

    if (!postgresUp) {
      // Postgres = dépendance dure : 503 → l'ingress retire le pod du service.
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  private async pingPostgres(): Promise<boolean> {
    try {
      await this.withTimeout(
        this.dataSource.query('SELECT 1'),
        3000,
        'postgres',
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Readiness : Postgres injoignable : ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private async pingRedis(): Promise<boolean> {
    try {
      const res = await this.withTimeout(this.redis.ping(), 2000, 'redis');
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  /** Borne une promesse dans le temps : une sonde ne doit jamais rester pendue. */
  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout ${label} après ${ms}ms`)),
        ms,
      );
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
