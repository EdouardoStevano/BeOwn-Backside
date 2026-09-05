import { CacheInterceptor, CACHE_TTL_METADATA } from '@nestjs/cache-manager';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import {
  PublicFeesController,
  TTL_CACHE_FRAIS_MS,
} from './public-fees.controller';
import { PublicStatisticsService } from 'src/kpi/applications/public-statistics.service';

/**
 * Routes publiques stables : le cache se vérifie SUR LES DÉCORATEURS et sur la
 * constante de durée. Un `@CacheTTL` retiré ou ramené à zéro ne casse aucun
 * test fonctionnel — la route répond parfaitement, elle martèle simplement la
 * base à chaque visiteur anonyme.
 */
describe('GET /public/platform-fees — cache 60 s', () => {
  const handler = PublicFeesController.prototype.getFees;

  it('porte un CacheInterceptor', () => {
    const interceptors: unknown[] =
      Reflect.getMetadata(INTERCEPTORS_METADATA, handler) ?? [];
    expect(interceptors).toContain(CacheInterceptor);
  });

  it('déclare une durée de vie de 60 000 ms (cache-manager v7 compte en ms)', () => {
    expect(Reflect.getMetadata(CACHE_TTL_METADATA, handler)).toBe(60_000);
    expect(TTL_CACHE_FRAIS_MS).toBe(60_000);
  });
});

describe('GET /public/statistics — cache déjà en place', () => {
  it('conserve ses agrégats 60 s sans relire la base', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{}]) };
    const service = new PublicStatisticsService(dataSource as any);

    await service.lire();
    const appelsApresPremiereLecture = dataSource.query.mock.calls.length;
    await service.lire();
    await service.lire();

    expect(appelsApresPremiereLecture).toBeGreaterThan(0);
    expect(dataSource.query).toHaveBeenCalledTimes(appelsApresPremiereLecture);
  });
});
