import { ForbiddenException } from '@nestjs/common';
import { MetricsController } from './metrics.controller';

/**
 * `/metrics` est `@Public()` et expose des agrégats d'activité de la
 * plateforme (volumes de souscription, backlog KYC, taux d'échec de paiement).
 *
 * La règle précédente n'exigeait le jeton QU'en production : tout
 * environnement non nommé « production » — staging, recette, ou un déploiement
 * où `NODE_ENV` n'est simplement pas positionné — servait ces métriques en
 * accès libre. La règle est inversée : jeton exigé partout, sauf
 * `development` explicite.
 */
describe('MetricsController — exigence du jeton', () => {
  const makeController = (env: Record<string, string | undefined>) => {
    const adapter = {
      contentType: 'text/plain',
      scrape: jest.fn().mockResolvedValue('# HELP beown_up'),
    };
    const config = { get: jest.fn((cle: string) => env[cle]) };
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;
    return {
      controller: new MetricsController(adapter as any, config as any),
      adapter,
      res,
    };
  };

  it.each(['production', 'staging', 'preprod', 'recette', 'qa'])(
    'refuse sans METRICS_TOKEN en %s',
    async (NODE_ENV) => {
      const { controller, adapter, res } = makeController({ NODE_ENV });

      await expect(controller.scrape(undefined, res)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(adapter.scrape).not.toHaveBeenCalled();
    },
  );

  it('refuse sans METRICS_TOKEN quand NODE_ENV est ABSENT (déploiement mal configuré)', async () => {
    const { controller, adapter, res } = makeController({});

    await expect(controller.scrape(undefined, res)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(adapter.scrape).not.toHaveBeenCalled();
  });

  it('tolère l’absence de jeton en développement local explicite', async () => {
    const { controller, adapter, res } = makeController({
      NODE_ENV: 'development',
    });

    await controller.scrape(undefined, res);

    expect(adapter.scrape).toHaveBeenCalled();
  });

  describe('avec METRICS_TOKEN configuré', () => {
    const env = { NODE_ENV: 'production', METRICS_TOKEN: 'jeton-secret' };

    it('accepte le bon jeton', async () => {
      const { controller, adapter, res } = makeController(env);

      await controller.scrape('Bearer jeton-secret', res);

      expect(adapter.scrape).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith('# HELP beown_up');
    });

    it.each([undefined, '', 'Bearer mauvais', 'jeton-secret-plus-long'])(
      'refuse « %s »',
      async (autorisation) => {
        const { controller, adapter, res } = makeController(env);

        await expect(
          controller.scrape(autorisation, res),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(adapter.scrape).not.toHaveBeenCalled();
      },
    );

    it('accepte le jeton nu, sans préfixe Bearer', async () => {
      const { controller, adapter, res } = makeController(env);

      await controller.scrape('jeton-secret', res);

      expect(adapter.scrape).toHaveBeenCalled();
    });
  });
});
