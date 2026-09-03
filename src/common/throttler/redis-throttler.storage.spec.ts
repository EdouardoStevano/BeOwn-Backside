import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Le fail-closed de ce storage a fermé TOUTE l'API lors de sa première mise
 * en service (palier `auth` global + compteur partagé par les trois paliers) :
 * ces tests figent les trois conditions qui bornent désormais le refus, et le
 * comptage PAR PALIER qui rend le seuil de 3 réellement significatif.
 *
 * Aucun Redis réel : le client est un faux injecté par le constructeur
 * (`@Optional() redis`), exactement le point de substitution prévu pour ça.
 */
type FakeRedis = {
  eval: jest.Mock;
  on: jest.Mock;
  quit: jest.Mock;
};

const fakeRedis = (): FakeRedis => ({
  eval: jest.fn(),
  on: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
});

const AUTH_TIGHT_LIMIT = 10; // budget resserré type sign-in
const TTL = 900_000;

describe('RedisThrottlerStorage — fail-closed borné', () => {
  let redis: FakeRedis;
  let storage: RedisThrottlerStorage;
  const nodeEnvInitial = process.env.NODE_ENV;

  const enPanne = () =>
    redis.eval.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

  const increment = (name: string, limit: number) =>
    storage.increment('cle', TTL, limit, TTL, name);

  beforeEach(() => {
    redis = fakeRedis();
    storage = new RedisThrottlerStorage(redis as never);
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    // Ne jamais laisser fuiter l'environnement simulé vers les autres suites.
    if (nodeEnvInitial === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnvInitial;
  });

  it('relaie le verdict de Redis quand il répond', async () => {
    redis.eval.mockResolvedValue([3, 5000, 0, 0]);
    const record = await increment('auth', AUTH_TIGHT_LIMIT);
    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 5,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it("compte les échecs PAR PALIER : trois requêtes (pas une seule) avant de fermer l'auth resserrée", async () => {
    enPanne();
    // Une requête HTTP évalue les trois paliers : si le compteur était
    // partagé, `auth` fermerait ici dès la première requête — c'est le bug
    // constaté en production locale (429 sur tout, /health excepté).
    for (const palier of ['short', 'medium']) {
      await increment(palier, 500);
    }
    expect((await increment('auth', AUTH_TIGHT_LIMIT)).isBlocked).toBe(false); // 1er échec auth
    expect((await increment('auth', AUTH_TIGHT_LIMIT)).isBlocked).toBe(false); // 2e
    expect((await increment('auth', AUTH_TIGHT_LIMIT)).isBlocked).toBe(true); // 3e → fermé
  });

  it('ne ferme JAMAIS le filet global auth (limite non resserrée)', async () => {
    enPanne();
    for (let i = 0; i < 10; i += 1) {
      const record = await increment(
        'auth',
        RedisThrottlerStorage.AUTH_GLOBAL_LIMIT,
      );
      expect(record.isBlocked).toBe(false);
    }
  });

  it.each(['short', 'medium'])(
    'ne ferme jamais le palier de trafic %s',
    async (palier) => {
      enPanne();
      for (let i = 0; i < 10; i += 1) {
        expect((await increment(palier, 10)).isBlocked).toBe(false);
      }
    },
  );

  it.each([
    ['development', 'development'],
    ['absent (poste local sans .env NODE_ENV)', undefined],
  ])('ne ferme jamais quand NODE_ENV est %s', async (_libelle, env) => {
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
    enPanne();
    for (let i = 0; i < 5; i += 1) {
      expect((await increment('auth', AUTH_TIGHT_LIMIT)).isBlocked).toBe(false);
    }
  });

  it('rouvre TOUS les paliers dès que Redis répond à nouveau', async () => {
    enPanne();
    for (let i = 0; i < 3; i += 1) await increment('auth', AUTH_TIGHT_LIMIT);
    expect((await increment('auth', AUTH_TIGHT_LIMIT)).isBlocked).toBe(true);

    // Redis revient le temps d'UNE évaluation (sur n'importe quel palier)…
    redis.eval.mockResolvedValueOnce([1, 1000, 0, 0]);
    await increment('medium', 2000);

    // …la série est rompue : l'auth resserrée repart du seuil complet.
    enPanne();
    expect((await increment('auth', AUTH_TIGHT_LIMIT)).isBlocked).toBe(false);
    expect((await increment('auth', AUTH_TIGHT_LIMIT)).isBlocked).toBe(false);
    expect((await increment('auth', AUTH_TIGHT_LIMIT)).isBlocked).toBe(true);
  });

  it('la réponse fail-closed déclenche bien le 429 du guard (contrat ThrottlerStorage)', async () => {
    enPanne();
    for (let i = 0; i < 3; i += 1) await increment('auth', AUTH_TIGHT_LIMIT);
    const record = await increment('auth', AUTH_TIGHT_LIMIT);
    expect(record.isBlocked).toBe(true);
    expect(record.totalHits).toBeGreaterThan(AUTH_TIGHT_LIMIT);
    expect(record.timeToBlockExpire).toBeGreaterThan(0);
  });
});
