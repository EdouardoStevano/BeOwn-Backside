/* eslint-disable no-console */
/**
 * SONDE JETABLE — ANO-13 : le magasin de cache est-il réellement Redis ?
 *
 * Monte un conteneur Nest ne contenant QUE le `CacheModule`, configuré par
 * `buildCacheModuleOptions()` — c'est-à-dire EXACTEMENT la fabrique utilisée
 * par `app.module.ts`, pas une copie. Écrit ensuite une clé via le
 * `CACHE_MANAGER` injecté (le même jeton que celui dont dépendent les OTP
 * d'inscription et les codes OAuth), puis vérifie avec un client Redis
 * INDÉPENDANT que la clé existe côté serveur.
 *
 * Écrire puis relire par le même cache ne prouverait rien : un cache en
 * mémoire de processus passerait ce test. Seule la lecture par un second
 * client, hors du processus, tranche.
 *
 * Exécution :
 *   npx ts-node -r tsconfig-paths/register scripts/probe-cache-redis.ts
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CacheModule, CACHE_MANAGER } from '@nestjs/cache-manager';
import Redis from 'ioredis';
import { buildCacheModuleOptions } from '../src/common/redis/cache.config';
import { resolveRedisConnection } from '../src/common/redis/redis-connection';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: buildCacheModuleOptions,
    }),
  ],
})
class CacheProbeModule {}

const KEY = `probe-cache-${Date.now()}`;
const VALUE = { probe: 'ano-13', at: new Date().toISOString() };

const scanAll = async (redis: Redis, pattern: string): Promise<string[]> => {
  const found: string[] = [];
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = next;
    found.push(...keys);
  } while (cursor !== '0');
  return found;
};

async function main(): Promise<void> {
  const { host, port } = resolveRedisConnection();
  console.log(`Redis cible : ${host}:${port}`);

  // Pré-vol : sans Redis debout, la sonde ne prouve RIEN. On échoue vite et
  // explicitement plutôt que de laisser ioredis boucler ses reconnexions et
  // faire croire à un blocage du code applicatif.
  const preflight = new Redis({
    host,
    port,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    lazyConnect: true,
  });
  try {
    await preflight.connect();
    console.log(`Ping : ${await preflight.ping()}`);
  } catch (err: any) {
    console.log(
      `\nRESULTAT : INDETERMINE — Redis injoignable sur ${host}:${port} ` +
        `(${err?.message ?? err}).\n` +
        'Démarrer Redis puis relancer la sonde ; la preuve exige un serveur debout.',
    );
    preflight.disconnect();
    process.exitCode = 2;
    return;
  } finally {
    preflight.disconnect();
  }

  const app = await NestFactory.createApplicationContext(CacheProbeModule, {
    logger: ['error'],
  });
  const redis = new Redis({ host, port, maxRetriesPerRequest: 1 });

  try {
    const cache: any = app.get(CACHE_MANAGER);
    console.log(`CACHE_MANAGER : ${cache?.constructor?.name ?? typeof cache}`);

    console.log(`\n[1] Écriture via CACHE_MANAGER — clé "${KEY}" (TTL 60 s)`);
    await cache.set(KEY, VALUE, 60_000);
    console.log('    écrite');

    console.log('[2] Relecture par le cache applicatif');
    console.log(`    valeur = ${JSON.stringify(await cache.get(KEY))}`);

    console.log('[3] Vérification par un client Redis INDÉPENDANT (SCAN)');
    const found = await scanAll(redis, `*${KEY}*`);
    console.log(`    clés trouvées : ${JSON.stringify(found)}`);

    if (found.length === 0) {
      console.log(
        '\nRESULTAT : ECHEC — clé absente de Redis. Le cache est encore en ' +
          'mémoire de processus (ANO-13 non corrigé).',
      );
      process.exitCode = 1;
    } else {
      console.log(`    TTL (ms)     : ${await redis.pttl(found[0])}`);
      console.log(`    contenu brut : ${await redis.get(found[0])}`);
      console.log(
        '\nRESULTAT : OK — CACHE_MANAGER écrit bien dans Redis (clé visible par un client tiers).',
      );
      await redis.del(...found);
      console.log('    clé de sonde supprimée');
    }

    console.log('\n[4] Clés OTP d\'inscription actuellement présentes');
    const otp = await scanAll(redis, '*registration-otp*');
    console.log(`    ${otp.length} clé(s) : ${JSON.stringify(otp.slice(0, 10))}`);
  } finally {
    await redis.quit().catch(() => undefined);
    await app.close();
  }
}

main().catch((err) => {
  console.error(`Sonde interrompue : ${err?.message ?? err}`);
  process.exit(1);
});
