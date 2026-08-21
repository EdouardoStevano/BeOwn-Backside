/**
 * Source unique de la configuration de connexion Redis.
 *
 * Redis héberge des données dont la perte est fonctionnellement visible :
 * compteurs de limitation de débit, identifiants de refresh token, codes OTP
 * d'inscription et codes d'échange OAuth. Chaque composant lisait jusqu'ici
 * `REDIS_HOST`/`REDIS_PORT` pour son compte ; les faire converger ici évite
 * qu'un client pointe ailleurs qu'un autre.
 *
 * Fonction pure et paramétrée par l'environnement : testable sans toucher au
 * `process.env` global.
 */
export const DEFAULT_REDIS_HOST = '127.0.0.1';
export const DEFAULT_REDIS_PORT = 6379;

export interface RedisConnection {
  host: string;
  port: number;
  /** URL `redis://…`, forme attendue par les clients basés sur node-redis. */
  url: string;
}

export function resolveRedisConnection(
  env: NodeJS.ProcessEnv = process.env,
): RedisConnection {
  const host = (env.REDIS_HOST ?? '').trim() || DEFAULT_REDIS_HOST;
  const parsedPort = Number.parseInt((env.REDIS_PORT ?? '').trim(), 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0
    ? parsedPort
    : DEFAULT_REDIS_PORT;

  const password = (env.REDIS_PASSWORD ?? '').trim();
  // Le mot de passe est encodé : un caractère réservé (`@`, `/`, `:`) casserait
  // sinon l'URL et ferait pointer le client vers un hôte inattendu.
  const credentials = password ? `:${encodeURIComponent(password)}@` : '';

  return { host, port, url: `redis://${credentials}${host}:${port}` };
}
