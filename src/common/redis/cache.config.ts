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
 * Extrait d'`app.module.ts` pour que la sonde et les tests exercent la
 * configuration RÉELLE, et non une copie susceptible de diverger.
 */
export function buildCacheModuleOptions() {
  const { url } = resolveRedisConnection();
  return {
    stores: [
      new Keyv({
        store: new KeyvRedis(url),
        // Espace de noms vide : les clés arrivent dans Redis sous leur nom
        // applicatif exact (`registration-otp-<id>`), ce qu'inspectent les
        // procédures d'exploitation et de QA au SCAN.
        namespace: undefined,
      }),
    ],
  };
}
