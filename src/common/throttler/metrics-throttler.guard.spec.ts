import { Reflector } from '@nestjs/core';
import { MetricsThrottlerGuard } from './metrics-throttler.guard';

/**
 * Anomalie de recette : le tracker par défaut de `ThrottlerGuard` est `req.ip`.
 * Derrière un NAT partagé, un seul investisseur épuisant un palier resserré
 * bloquait tous les autres — une limite « par client » comptait des tuyaux.
 *
 * Le seau devient nominatif dès qu'une identité est ÉTABLIE (jeton
 * effectivement vérifié), et reste l'IP sinon — les routes d'authentification,
 * non authentifiées par construction, gardent donc leur comptage par IP, ce
 * qui est le comportement attendu d'une protection contre le bourrage
 * d'identifiants.
 */

const IP = '203.0.113.7';

/** Accès à la méthode protégée, sans changer sa visibilité en production. */
type GuardAvecTracker = MetricsThrottlerGuard & {
  getTracker(req: Record<string, any>): Promise<string>;
};

const makeGuard = (verifyAccessToken: jest.Mock): GuardAvecTracker =>
  new MetricsThrottlerGuard(
    { throttlers: [] } as any,
    {} as any,
    new Reflector(),
    { incrementCounter: jest.fn() } as any,
    { verifyAccessToken } as any,
  ) as GuardAvecTracker;

const requete = (
  overrides: Partial<{
    ip: string;
    headers: Record<string, unknown>;
    user: unknown;
  }> = {},
): Record<string, any> => ({
  ip: IP,
  ips: [],
  headers: {},
  ...overrides,
});

describe('MetricsThrottlerGuard — seau de comptage', () => {
  it('compte par UTILISATEUR quand le jeton est valide', async () => {
    const verify = jest.fn().mockResolvedValue({ sub: 42, email: 'a@b.c' });
    const guard = makeGuard(verify);

    const tracker = await guard.getTracker(
      requete({ headers: { authorization: 'Bearer jeton-valide' } }),
    );

    expect(tracker).toBe('u:42');
    expect(tracker).not.toContain(IP);
    expect(verify).toHaveBeenCalledWith('jeton-valide');
  });

  it('deux utilisateurs DERRIÈRE LA MÊME IP ont deux seaux distincts', async () => {
    // Le cœur de l'anomalie : sans cela, l'un consomme le palier de l'autre.
    const guard = makeGuard(
      jest
        .fn()
        .mockResolvedValueOnce({ sub: 42 })
        .mockResolvedValueOnce({ sub: 43 }),
    );

    const a = await guard.getTracker(
      requete({ headers: { authorization: 'Bearer jeton-a' } }),
    );
    const b = await guard.getTracker(
      requete({ headers: { authorization: 'Bearer jeton-b' } }),
    );

    expect(a).not.toBe(b);
  });

  it('honore un `req.user` déjà résolu sans re-vérifier le jeton', async () => {
    const verify = jest.fn();
    const guard = makeGuard(verify);

    const tracker = await guard.getTracker(
      requete({
        user: { userId: 7 },
        headers: { authorization: 'Bearer peu-importe' },
      }),
    );

    expect(tracker).toBe('u:7');
    expect(verify).not.toHaveBeenCalled();
  });

  describe('repli sur l’IP — routes NON authentifiées', () => {
    it('aucun en-tête Authorization : comptage par IP', async () => {
      const guard = makeGuard(jest.fn());
      await expect(guard.getTracker(requete())).resolves.toBe(IP);
    });

    it('jeton invalide ou expiré : comptage par IP, jamais nominatif', async () => {
      // Sans cela, un attaquant choisirait son propre seau et la limitation
      // ne limiterait plus rien.
      const guard = makeGuard(jest.fn().mockRejectedValue(new Error('expiré')));
      await expect(
        guard.getTracker(
          requete({ headers: { authorization: 'Bearer forge' } }),
        ),
      ).resolves.toBe(IP);
    });

    it.each([
      ['schéma non Bearer', 'Basic abc'],
      ['Bearer sans jeton', 'Bearer'],
      ['en-tête vide', ''],
    ])('%s : comptage par IP', async (_cas, authorization) => {
      const verify = jest.fn();
      const guard = makeGuard(verify);
      await expect(
        guard.getTracker(requete({ headers: { authorization } })),
      ).resolves.toBe(IP);
      expect(verify).not.toHaveBeenCalled();
    });

    it('jeton valide mais sans `sub` : comptage par IP', async () => {
      const guard = makeGuard(jest.fn().mockResolvedValue({ email: 'a@b.c' }));
      await expect(
        guard.getTracker(
          requete({ headers: { authorization: 'Bearer sans-sub' } }),
        ),
      ).resolves.toBe(IP);
    });
  });

  it('le préfixe empêche toute collision entre un id et une IP littérale', async () => {
    const guard = makeGuard(jest.fn().mockResolvedValue({ sub: IP }));
    const nominatif = await guard.getTracker(
      requete({ headers: { authorization: 'Bearer jeton' } }),
    );
    const parIp = await makeGuard(jest.fn()).getTracker(requete());

    expect(nominatif).not.toBe(parIp);
  });
});
