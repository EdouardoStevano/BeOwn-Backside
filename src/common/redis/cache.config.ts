import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { resolveRedisConnection } from './redis-connection';

/**
 * Options du cache applicatif (`CACHE_MANAGER`), adossées à Redis.
 *
 * ANO-13 — la configuration précédente déclarait
 * `store: redisStore` (cache-manager-ioredis, API cache-manager v3/v4) alors
 * que le projet embarque cache-manager v7 et @nestjs/cache-manager v3, dont le
 * contrat est `stores: Keyv[]`. L'option inconnue était **ignorée sans erreur**
 * et le cache retombait silencieusement en mémoire de processus. Conséquence
 * mesurée en QA : aucune clé `registration-otp-*` n'atteignait Redis — les
 * codes d'inscription et les codes d'échange OAuth n'étaient ni partagés entre
 * réplicas, ni conservés au redémarrage.
 *
 * CLIENT BORNÉ — panne constatée, pas théorique. Le client par défaut de
 * node-redis met les commandes en FILE D'ATTENTE tant que la connexion n'est
 * pas rétablie : Redis éteint, chaque `SET` du cache attendait indéfiniment…
 * or l'émission des jetons écrit l'identifiant du refresh token dans ce cache.
 * Résultat observé : `POST /auth/sign-in` sans réponse pendant 90 s+ pour TOUT
 * le monde — une panne de cache devenait une panne d'authentification totale.
 * D'où les trois bornes ci-dessous :
 *  - `disableOfflineQueue` : hors connexion, une commande ÉCHOUE immédiatement
 *    au lieu d'attendre — l'appelant (SessionCacheService) sait se dégrader ;
 *  - `connectTimeout` court : jamais bloqué sur un SYN qui ne répond pas ;
 *  - `reconnectStrategy` plafonnée : on retente sans fin, mais jamais plus
 *    d'une fois toutes les 8 s — la reprise reste automatique quand Redis
 *    revient.
 *
 * Extrait d'`app.module.ts` pour que la sonde et les tests exercent la
 * configuration RÉELLE, et non une copie susceptible de diverger.
 */
export function buildCacheModuleOptions() {
  const { url } = resolveRedisConnection();

  const keyv = new Keyv({
    // Les options sont transmises telles quelles à `createClient` de
    // node-redis par @keyv/redis (qui attache lui-même l'écouteur 'error'
    // du client et relaie vers le store — capté par keyv.on('error') plus
    // bas). Passer les OPTIONS plutôt qu'un client déjà construit évite un
    // conflit de génériques entre nos types `redis` et ceux embarqués par
    // @keyv/redis.
    store: new KeyvRedis({
      url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 2_000,
        reconnectStrategy: (retries: number) =>
          Math.min(500 * 2 ** Math.min(retries, 4), 8_000),
      },
    }),
    // Espace de noms vide : les clés arrivent dans Redis sous leur nom
    // applicatif exact (`registration-otp-<id>`), ce qu'inspectent les
    // procédures d'exploitation et de QA au SCAN.
    namespace: undefined,
  });
  // Même raison : Keyv relaie les erreurs du store en événements 'error'.
  keyv.on('error', () => undefined);

  return { stores: [keyv] };
}
