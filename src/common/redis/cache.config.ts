import { Logger } from '@nestjs/common';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { resolveRedisConnection } from './redis-connection';

const logger = new Logger('CacheRedis');

/**
 * Attache un écouteur `'error'` à un émetteur, s'il en est un.
 *
 * Ce n'est pas une précaution de style : sur un `EventEmitter` de Node,
 * l'émission d'un `'error'` SANS AUCUN ÉCOUTEUR est relancée en exception non
 * capturée, ce qui TUE LE PROCESSUS. Le client node-redis émet `'error'` à
 * chaque échec de connexion, et il retente indéfiniment (reconnectStrategy).
 * Une simple indisponibilité de Redis suffisait donc à faire tomber le pod —
 * puis le suivant, en boucle de redémarrage.
 *
 * Rend `true` si l'écouteur a pu être posé, pour que la configuration puisse
 * dire tout haut ce qu'elle n'a pas réussi à protéger.
 */
function ecouterLesErreurs(cible: unknown, contexte: string): boolean {
  const emetteur = cible as {
    on?: (evenement: string, callback: (erreur: unknown) => void) => unknown;
  };
  if (typeof emetteur?.on !== 'function') return false;

  emetteur.on('error', (erreur: unknown) => {
    // Journalisé, JAMAIS relancé : le cache est une dépendance dégradable
    // (SessionCacheService borne ses appels et sait se passer de Redis).
    logger.warn(
      `Cache Redis indisponible (${contexte}) : ${
        erreur instanceof Error ? erreur.message : String(erreur)
      }`,
    );
  });
  return true;
}

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

  // Les options sont transmises telles quelles à `createClient` de node-redis
  // par @keyv/redis. Passer les OPTIONS plutôt qu'un client déjà construit
  // évite un conflit de génériques entre nos types `redis` et ceux embarqués
  // par @keyv/redis.
  const store = new KeyvRedis({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: (retries: number) =>
        Math.min(500 * 2 ** Math.min(retries, 4), 8_000),
    },
  });

  const keyv = new Keyv({
    store,
    // Espace de noms vide : les clés arrivent dans Redis sous leur nom
    // applicatif exact (`registration-otp-<id>`), ce qu'inspectent les
    // procédures d'exploitation et de QA au SCAN.
    namespace: undefined,
  });

  // TROIS niveaux, parce qu'aucun ne couvre les deux autres.
  //
  // Le commentaire précédent affirmait que @keyv/redis attachait lui-même
  // l'écouteur 'error' du client node-redis et relayait vers Keyv. C'est FAUX
  // pour la version embarquée : vérifié, `store.client.listenerCount('error')`
  // valait ZÉRO. Le client node-redis émet 'error' à chaque échec de connexion
  // et retente indéfiniment — un `'error'` sans écouteur est relancé en
  // exception non capturée par Node, donc une indisponibilité de Redis TUAIT
  // le processus, puis le suivant, en boucle de redémarrage.
  //
  // L'écouteur sur `keyv` seul ne suffisait pas : il n'attrape que ce que Keyv
  // relaie, pas les événements du client sous-jacent.
  ecouterLesErreurs(keyv, 'keyv');
  ecouterLesErreurs(store, 'store');
  const clientProtege = ecouterLesErreurs(
    (store as unknown as { client?: unknown }).client,
    'client node-redis',
  );
  if (!clientProtege) {
    // Le jour où @keyv/redis change la forme de son client, on veut le SAVOIR
    // — pas le découvrir sur un pod qui redémarre en boucle.
    logger.error(
      "Client Redis sous-jacent introuvable : impossible d'y attacher un " +
        "écouteur 'error'. Une panne Redis peut faire tomber le processus.",
    );
  }

  return { stores: [keyv] };
}
