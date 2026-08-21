import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * Stockage des compteurs de limitation de débit dans Redis (finding M-5).
 *
 * Le stockage par défaut de `@nestjs/throttler` est une `Map` en mémoire de
 * processus. Conséquences constatées lors du test fonctionnel :
 * - avec N réplicas (HPA jusqu'à 6), le budget réel d'un attaquant est
 *   multiplié par N — chaque pod compte pour lui seul ;
 * - **un simple redémarrage remet tous les compteurs à zéro** : la limitation
 *   saute à chaque redéploiement ;
 * - c'est aussi un état conservé en mémoire entre deux requêtes, contraire à
 *   la règle « stateless » du projet.
 *
 * Redis est déjà une dépendance critique du service (identifiants de refresh
 * token, OTP) : y placer les compteurs ne crée pas de nouveau point de panne.
 *
 * En cas d'indisponibilité de Redis, on laisse passer la requête (fail-open)
 * en journalisant : la limitation de débit est une protection anti-abus, pas
 * un contrôle d'autorisation — la transformer en panne totale de l'API serait
 * un remède pire que le mal. Les gardes d'authentification et d'autorisation,
 * elles, restent intactes.
 */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;

  /**
   * Script Lua : l'incrément, la pose du verrou et la lecture des TTL doivent
   * être atomiques, sinon deux requêtes concurrentes peuvent franchir la
   * limite ensemble (c'est précisément le genre de course que cette limite
   * est censée empêcher).
   *
   * KEYS[1] compteur · KEYS[2] verrou · ARGV[1] ttl(ms) · ARGV[2] limite · ARGV[3] blocage(ms)
   * Retour : { hits, ttlRestant(ms), estBloque(0|1), blocageRestant(ms) }
   */
  private static readonly SCRIPT = `
    local hitsKey, blockKey = KEYS[1], KEYS[2]
    local ttl, limit, blockDuration = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])

    local blockPttl = redis.call('PTTL', blockKey)
    if blockPttl > 0 then
      local hits = tonumber(redis.call('GET', hitsKey) or '0')
      local pttl = redis.call('PTTL', hitsKey)
      if pttl < 0 then pttl = blockPttl end
      return { hits, pttl, 1, blockPttl }
    end

    local hits = redis.call('INCR', hitsKey)
    local pttl = redis.call('PTTL', hitsKey)
    if hits == 1 or pttl < 0 then
      redis.call('PEXPIRE', hitsKey, ttl)
      pttl = ttl
    end

    if hits > limit then
      redis.call('SET', blockKey, '1', 'PX', blockDuration)
      -- le compteur expire avec le verrou : à la levée du blocage on repart de zéro
      redis.call('PEXPIRE', hitsKey, blockDuration)
      return { hits, blockDuration, 1, blockDuration }
    end

    return { hits, pttl, 0, 0 }
  `;

  constructor(@Optional() redis?: Redis) {
    this.redis =
      redis ??
      new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT ?? 6379),
        // Ne jamais mettre une requête HTTP en attente sur Redis : si la
        // connexion est perdue, on échoue vite et on laisse passer.
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: false,
      });
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis (limitation de débit) indisponible : ${err.message}`);
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitsKey}:blocked`;

    try {
      const [hits, ttlRemaining, blocked, blockRemaining] =
        (await this.redis.eval(
          RedisThrottlerStorage.SCRIPT,
          2,
          hitsKey,
          blockKey,
          String(ttl),
          String(limit),
          String(blockDuration || ttl),
        )) as [number, number, number, number];

      return {
        totalHits: Number(hits),
        // Le contrat de ThrottlerStorage exprime ces deux durées en SECONDES
        // (cf. l'implémentation mémoire de référence), alors que ttl et
        // blockDuration arrivent en millisecondes.
        timeToExpire: Math.ceil(Number(ttlRemaining) / 1000),
        isBlocked: Number(blocked) === 1,
        timeToBlockExpire: Math.ceil(Number(blockRemaining) / 1000),
      };
    } catch (err) {
      this.logger.error(
        `Compteur de limitation indisponible (${throttlerName}) — requête laissée passer : ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
