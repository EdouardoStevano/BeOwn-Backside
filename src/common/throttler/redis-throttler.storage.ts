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
 * ─── Comportement en panne Redis : DEUX régimes ─────────────────────────────
 *
 * Le fail-open uniforme d'origine avait une conséquence non voulue : une panne
 * Redis supprimait TOUTE limitation, y compris sur `POST /auth/sign-in`. Un
 * attaquant capable de saturer Redis (ou qui tombe sur une panne) obtenait de
 * ce seul fait un bourrage d'identifiants sans plafond — la panne d'un
 * composant d'infrastructure devenait une porte ouverte sur l'authentification.
 *
 * Arbitrage retenu, palier par palier :
 *
 *  - paliers de TRAFIC (`short`, `medium`) → FAIL-OPEN. La limitation y est une
 *    protection anti-abus de confort ; la transformer en panne totale de l'API
 *    serait un remède pire que le mal. Les gardes d'authentification et
 *    d'autorisation, elles, restent intactes.
 *
 *  - palier d'AUTHENTIFICATION (`auth`, celui que `@Throttle({ auth: … })`
 *    resserre sur sign-in / MFA / reset de mot de passe) → FAIL-CLOSED, mais
 *    seulement après {@link MAX_CONSECUTIVE_REDIS_FAILURES} échecs Redis
 *    CONSÉCUTIFS. Ce seuil est délibéré : un incident isolé (timeout unique,
 *    bascule de connexion) ne doit pas verrouiller la connexion de tout le
 *    monde, alors qu'une indisponibilité réelle et durable doit fermer la
 *    porte plutôt que la laisser sans compteur.
 *
 * Coût assumé du fail-closed : pendant une panne Redis prolongée, plus
 * personne ne peut se connecter (les sessions déjà ouvertes continuent de
 * fonctionner, le JWT étant vérifié sans Redis). C'est le comportement voulu :
 * une indisponibilité visible et bornée vaut mieux qu'une fenêtre de bourrage
 * d'identifiants silencieuse. La panne Redis est de toute façon déjà un
 * incident majeur — OTP et refresh tokens y vivent.
 */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;

  /**
   * Paliers dont l'échec Redis bascule en refus (fail-closed). Aligné sur les
   * noms déclarés dans `ThrottlerModule.forRootAsync` (app.module.ts) : seul
   * `auth` protège le parcours d'authentification ; `short` et `medium` sont
   * des paliers de trafic et restent en fail-open.
   */
  private static readonly FAIL_CLOSED_THROTTLERS = new Set(['auth']);

  /**
   * Borne de sûreté du fail-closed, et limite par défaut du palier `auth`
   * déclaré dans app.module.
   *
   * Historique — le nom du palier ne suffisait PAS à décider le fail-closed :
   * `auth` était alors un filet GLOBAL appliqué à toutes les routes, si bien
   * que fermer sur le nom fermait l'API entière à la première panne Redis
   * (constaté : trois échecs — short, medium, auth — dès la PREMIÈRE requête,
   * puis 429 sur tout, /health excepté). Le discriminant retenu est donc la
   * LIMITE EFFECTIVE reçue : seules les routes qui ont resserré leur budget
   * via `@Throttle({ auth: { limit: 3..60 } })` ferment.
   *
   * Depuis la passe 4, `auth` n'est plus global : le `skipIf` de
   * paliers.config.ts ne l'évalue que sur les routes qui l'ont explicitement
   * posé (sign-in, OTP, reset, MFA — toutes à limite ≤ 50). La condition
   * ci-dessous devient donc une redondance de sûreté plutôt qu'un
   * discriminant : elle continue d'écarter du fail-closed tout palier `auth`
   * qui serait posé LARGE — un budget de 500 sur 15 minutes ne protège de
   * toute façon d'aucun bourrage d'identifiants, et couper le trafic sur une
   * panne Redis y serait un remède pire que le mal.
   */
  static readonly AUTH_GLOBAL_LIMIT = 500;

  /**
   * Nombre d'échecs Redis CONSÉCUTIFS au-delà duquel les paliers ci-dessus
   * refusent. En dessous, on laisse passer : un timeout isolé ne doit pas
   * verrouiller la connexion de tout le monde.
   */
  private static readonly MAX_CONSECUTIVE_REDIS_FAILURES = 3;

  /**
   * Échecs Redis consécutifs, comptés PAR PALIER et remis à zéro à la
   * première réussite.
   *
   * Par palier, et non globalement : chaque requête évalue les trois paliers,
   * donc un compteur partagé atteignait 3 dès la PREMIÈRE requête d'une panne
   * — le « un timeout isolé ne ferme pas la porte » promis ici était faux.
   * Compté par palier, le seuil signifie ce qu'il dit : trois évaluations du
   * palier `auth` en échec, soit trois requêtes distinctes vers une route
   * resserrée, avant de refuser.
   *
   * NB : cet état vit dans la mémoire du process — c'est l'unique état en
   * mémoire de cette classe, et il est assumé. Il ne peut pas vivre dans
   * Redis (on ne compte des échecs Redis que parce que Redis est injoignable),
   * et sa portée par pod est suffisante : chaque réplica constate la panne de
   * son côté et ferme sa propre porte. Il ne porte aucune décision métier et
   * une remise à zéro au redémarrage est sans conséquence.
   */
  private readonly redisFailuresParPalier = new Map<string, number>();

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

      // Redis répond : la panne est finie pour tout le monde, pas seulement
      // pour le palier qui vient de réussir — on rouvre tout.
      this.redisFailuresParPalier.clear();

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
      const failures =
        (this.redisFailuresParPalier.get(throttlerName) ?? 0) + 1;
      this.redisFailuresParPalier.set(throttlerName, failures);
      const reason = err instanceof Error ? err.message : String(err);

      const failClosed =
        RedisThrottlerStorage.FAIL_CLOSED_THROTTLERS.has(throttlerName) &&
        // Seules les routes au budget explicitement resserré ferment (cf.
        // AUTH_GLOBAL_LIMIT ci-dessus) — jamais un palier `auth` posé large.
        limit < RedisThrottlerStorage.AUTH_GLOBAL_LIMIT &&
        // Jamais en développement : un poste sans Redis local rendrait la
        // connexion impossible (constaté : sign-in en 429 permanent). Même
        // partage prod/dev que le fail-closed du reCAPTCHA. NODE_ENV absent
        // vaut développement — c'est le cas des postes locaux (.env ne le
        // définit pas), et les ConfigMaps k8s le définissent toujours.
        (process.env.NODE_ENV ?? 'development') !== 'development' &&
        failures >= RedisThrottlerStorage.MAX_CONSECUTIVE_REDIS_FAILURES;

      if (failClosed) {
        this.logger.error(
          `Compteur de limitation indisponible (${throttlerName}) — ` +
            `${failures} échecs Redis consécutifs sur ce palier : ` +
            `requête REFUSÉE (fail-closed sur le palier d'authentification). ` +
            `Cause : ${reason}`,
        );
        return {
          // `isBlocked` déclenche la ThrottlerException (429) dans le guard.
          // `totalHits` est renvoyé au-dessus de la limite pour rester
          // cohérent avec l'en-tête X-RateLimit-Remaining calculé par le guard.
          totalHits: limit + 1,
          timeToExpire: Math.ceil(ttl / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil((blockDuration || ttl) / 1000),
        };
      }

      this.logger.error(
        `Compteur de limitation indisponible (${throttlerName}) — requête laissée passer ` +
          `(${failures} échec(s) consécutif(s) sur ce palier, fail-closed sur ` +
          `« auth » à partir de ${RedisThrottlerStorage.MAX_CONSECUTIVE_REDIS_FAILURES}) : ${reason}`,
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
