import { CacheFirstSessionStoreProxy } from './cache-first-session-store.proxy';
import type { CacheSessionStore } from './cache-session-store.adapter';
import type { TypeOrmSessionStore } from 'src/iam/infrastructure/persistence/repositories/typeorm-session-store.repository';

const UTILISATEUR = 42;
const SESSION = 'refresh-token-id';

function monter() {
  const cache = {
    enregistrer: jest.fn().mockResolvedValue(undefined),
    estValide: jest.fn().mockResolvedValue(false),
    revoquer: jest.fn().mockResolvedValue(undefined),
    revoquerPlusieurs: jest.fn().mockResolvedValue(undefined),
  };
  const durable = {
    enregistrer: jest.fn().mockResolvedValue(undefined),
    estValide: jest.fn().mockResolvedValue(false),
    revoquer: jest.fn().mockResolvedValue(undefined),
    revoquerToutes: jest.fn().mockResolvedValue(undefined),
    identifiantsOuverts: jest.fn().mockResolvedValue([]),
  };

  return {
    proxy: new CacheFirstSessionStoreProxy(
      cache as unknown as CacheSessionStore,
      durable as unknown as TypeOrmSessionStore,
    ),
    cache,
    durable,
  };
}

const session = () => ({
  utilisateurId: UTILISATEUR,
  refreshTokenId: SESSION,
  expireLe: new Date(Date.now() + 86_400_000),
});

describe('CacheFirstSessionStoreProxy — ouverture de session', () => {
  it('écrit la base avant le cache', async () => {
    // Une session que le cache seul connaîtrait disparaîtrait avec lui.
    const { proxy, cache, durable } = monter();

    await proxy.enregistrer(session());

    expect(durable.enregistrer).toHaveBeenCalled();
    expect(durable.enregistrer.mock.invocationCallOrder[0]).toBeLessThan(
      cache.enregistrer.mock.invocationCallOrder[0],
    );
  });

  it('ouvre la session même si le cache est indisponible', async () => {
    // Redis absent ne doit pas empêcher de se connecter : la base suffit.
    const { proxy, cache } = monter();
    cache.enregistrer.mockRejectedValue(new Error('redis down'));

    await expect(proxy.enregistrer(session())).resolves.toBeUndefined();
  });
});

describe('CacheFirstSessionStoreProxy — validation', () => {
  it('répond depuis le cache sans toucher la base', async () => {
    const { proxy, cache, durable } = monter();
    cache.estValide.mockResolvedValue(true);

    await expect(proxy.estValide(UTILISATEUR, SESSION)).resolves.toBe(true);
    expect(durable.estValide).not.toHaveBeenCalled();
  });

  it('descend en base quand le cache ne sait pas, et réchauffe la clé', async () => {
    // Le scénario visé : Redis a été vidé, les sessions doivent survivre.
    const { proxy, cache, durable } = monter();
    cache.estValide.mockResolvedValue(false);
    durable.estValide.mockResolvedValue(true);

    await expect(proxy.estValide(UTILISATEUR, SESSION)).resolves.toBe(true);
    expect(durable.estValide).toHaveBeenCalledWith(UTILISATEUR, SESSION);
    // Réécrite : un cache vidé se repeuple au fil des renouvellements plutôt
    // que de rester froid.
    expect(cache.enregistrer).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: UTILISATEUR,
        refreshTokenId: SESSION,
      }),
    );
  });

  it('refuse quand ni le cache ni la base ne connaissent la session', async () => {
    const { proxy, cache } = monter();

    await expect(proxy.estValide(UTILISATEUR, SESSION)).resolves.toBe(false);
    // Rien n'est réchauffé : la session n'existe pas.
    expect(cache.enregistrer).not.toHaveBeenCalled();
  });

  it("ne prend jamais l'absence dans le cache pour une révocation", async () => {
    // C'est la différence entre un proxy et deux stockages de même rang : le
    // cache ne fait pas autorité pour dire « non ».
    const { proxy, durable } = monter();
    durable.estValide.mockResolvedValue(true);

    await expect(proxy.estValide(UTILISATEUR, SESSION)).resolves.toBe(true);
  });
});

describe('CacheFirstSessionStoreProxy — révocation', () => {
  it('retire la session des deux supports', async () => {
    const { proxy, cache, durable } = monter();

    await proxy.revoquer(UTILISATEUR, SESSION);

    expect(durable.revoquer).toHaveBeenCalledWith(UTILISATEUR, SESSION);
    expect(cache.revoquer).toHaveBeenCalledWith(UTILISATEUR, SESSION);
  });

  it('ferme toutes les sessions en lisant leurs identifiants dans la base', async () => {
    // Un cache ne sait pas énumérer ses clés : c'est la table qui les fournit,
    // et c'est ce que le proxy apporte qu'aucun support ne sait faire seul.
    const { proxy, cache, durable } = monter();
    durable.identifiantsOuverts.mockResolvedValue(['mobile', 'navigateur']);

    await proxy.revoquerToutes(UTILISATEUR);

    expect(durable.revoquerToutes).toHaveBeenCalledWith(UTILISATEUR);
    expect(cache.revoquerPlusieurs).toHaveBeenCalledWith(UTILISATEUR, [
      'mobile',
      'navigateur',
    ]);
  });

  it('lit les identifiants avant de vider la table', async () => {
    // Dans l'autre ordre, il ne resterait rien à retirer du cache — et les
    // clés y survivraient jusqu'à leur TTL.
    const { proxy, durable } = monter();

    await proxy.revoquerToutes(UTILISATEUR);

    expect(
      durable.identifiantsOuverts.mock.invocationCallOrder[0],
    ).toBeLessThan(durable.revoquerToutes.mock.invocationCallOrder[0]);
  });
});
