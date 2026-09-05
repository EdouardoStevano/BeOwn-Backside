import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { buildCacheModuleOptions } from './cache.config';
import {
  DEFAULT_REDIS_HOST,
  DEFAULT_REDIS_PORT,
  resolveRedisConnection,
} from './redis-connection';

/**
 * ANO-13 — le magasin de cache déclaré n'était pas honoré.
 *
 * `CacheModule.register({ store: redisStore, host, port })` employait l'API
 * cache-manager v3/v4, disparue de cache-manager v7 / @nestjs/cache-manager v3,
 * qui attendent `stores: Keyv[]`. L'option inconnue était ignorée SANS ERREUR :
 * le cache retombait en mémoire de processus et aucune clé n'atteignait Redis.
 *
 * Ces tests verrouillent le contrat de configuration. Ils ne remplacent pas la
 * vérification sur un Redis debout (`scripts/probe-cache-redis.ts`) : ils
 * garantissent qu'on ne peut pas re-régresser vers la forme silencieusement
 * ignorée.
 */
describe('resolveRedisConnection', () => {
  it('construit une URL redis:// depuis REDIS_HOST/REDIS_PORT', () => {
    expect(
      resolveRedisConnection({
        REDIS_HOST: 'redis-service',
        REDIS_PORT: '6380',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      host: 'redis-service',
      port: 6380,
      url: 'redis://redis-service:6380',
    });
  });

  it.each([
    ['variables absentes', {}],
    ['variables vides', { REDIS_HOST: '', REDIS_PORT: '' }],
    ['port illisible', { REDIS_HOST: '', REDIS_PORT: 'abc' }],
    ['port négatif', { REDIS_HOST: '', REDIS_PORT: '-1' }],
  ])('retombe sur les valeurs par défaut (%s)', (_label, env) => {
    const conn = resolveRedisConnection(env as NodeJS.ProcessEnv);
    expect(conn.host).toBe(DEFAULT_REDIS_HOST);
    expect(conn.port).toBe(DEFAULT_REDIS_PORT);
  });

  it('encode le mot de passe : un caractère réservé ne doit pas casser l\'URL', () => {
    const { url } = resolveRedisConnection({
      REDIS_HOST: 'cache',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: 'p@ss:w/rd',
    } as NodeJS.ProcessEnv);

    // Sans encodage, le `@` ferait pointer le client vers l'hôte « ss:w/rd ».
    expect(url).toBe('redis://:p%40ss%3Aw%2Frd@cache:6379');
    expect(new URL(url).hostname).toBe('cache');
  });

  it('ignore les espaces parasites autour des valeurs', () => {
    expect(
      resolveRedisConnection({
        REDIS_HOST: '  cache  ',
        REDIS_PORT: ' 6381 ',
      } as NodeJS.ProcessEnv),
    ).toEqual(
      expect.objectContaining({ host: 'cache', port: 6381 }),
    );
  });
});

describe('buildCacheModuleOptions', () => {
  let options: ReturnType<typeof buildCacheModuleOptions>;

  beforeAll(() => {
    options = buildCacheModuleOptions();
  });

  afterAll(async () => {
    // Referme le client Redis créé par la fabrique : sans cela le test laisse
    // une socket ouverte et jest ne rend pas la main.
    for (const store of options.stores) {
      await (store as any)?.disconnect?.().catch?.(() => undefined);
    }
  });

  it('expose `stores` (contrat cache-manager v7), pas l\'ancien `store`', () => {
    expect(Array.isArray(options.stores)).toBe(true);
    expect(options.stores).toHaveLength(1);
    // Le point exact de la régression : `store` (singulier) était accepté par
    // TypeScript via le type générique StoreConfig puis ignoré à l'exécution.
    expect(options).not.toHaveProperty('store');
    expect(options).not.toHaveProperty('host');
    expect(options).not.toHaveProperty('port');
  });

  it('le magasin est une instance Keyv adossée à KeyvRedis', () => {
    const store = options.stores[0];
    expect(store).toBeInstanceOf(Keyv);
    expect((store as any).store).toBeInstanceOf(KeyvRedis);
  });

  it('aucun espace de noms : les clés gardent leur nom applicatif exact', () => {
    // `registration-otp-<id>` doit apparaître tel quel dans Redis — c'est ce
    // que la QA et l'exploitation cherchent au SCAN. Un namespace Keyv
    // préfixerait les clés en `keyv:registration-otp-<id>`.
    const store = options.stores[0] as Keyv;
    expect(store.namespace).toBeUndefined();
  });

  it('cible bien la connexion Redis résolue depuis l\'environnement', () => {
    const { host, port } = resolveRedisConnection();
    const redisStore: any = (options.stores[0] as any).store;
    const optionsUrl: string =
      redisStore?.client?.options?.url ?? redisStore?.opts?.url ?? '';

    expect(optionsUrl).toContain(`${host}:${port}`);
  });

  /**
   * S4 — CRASH DU PROCESSUS SUR PANNE REDIS.
   *
   * Sur un `EventEmitter` de Node, l'émission d'un `'error'` SANS AUCUN
   * ÉCOUTEUR est relancée en exception non capturée : le processus meurt. Le
   * client node-redis émet `'error'` à chaque échec de connexion et retente
   * indéfiniment — une indisponibilité de Redis suffisait donc à faire tomber
   * le pod, puis le suivant, en boucle de redémarrage.
   *
   * Mesuré avant correction : `store.client.listenerCount('error') === 0`,
   * alors que le commentaire du fichier affirmait que @keyv/redis s'en
   * chargeait.
   */
  describe('résilience : écouteurs d’erreur', () => {
    it("le client node-redis sous-jacent a un écouteur 'error'", () => {
      const client: any = (options.stores[0] as any).store?.client;

      expect(client).toBeDefined();
      expect(client.listenerCount('error')).toBeGreaterThan(0);
    });

    /**
     * Assertion COMPORTEMENTALE, et non par comptage : `Keyv` v5 et le store
     * @keyv/redis n'exposent pas `listenerCount`. Ce qui compte de toute façon
     * n'est pas le nombre d'écouteurs mais le fait qu'un `'error'` ne remonte
     * pas — c'est exactement le crash observé.
     */
    it.each([
      ['client node-redis', (o: any) => o.stores[0].store.client],
      ['store @keyv/redis', (o: any) => o.stores[0].store],
      ['magasin Keyv', (o: any) => o.stores[0]],
    ])("un 'error' émis par %s ne remonte PAS en exception", (_nom, cible) => {
      const emetteur: any = cible(options);

      expect(() =>
        emetteur.emit('error', new Error('ECONNREFUSED 127.0.0.1:6379')),
      ).not.toThrow();
    });

    it("CONTRE-ÉPREUVE : sans écouteur, le même 'error' TUE le processus", () => {
      // Sans cette assertion, les trois précédentes passeraient même si Node
      // n'avait pas cette sémantique — et ne prouveraient rien.
      const nu = new (require('events').EventEmitter)();

      expect(() => nu.emit('error', new Error('boum'))).toThrow('boum');
    });
  });
});
