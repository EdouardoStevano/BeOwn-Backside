import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { type ConfigType } from '@nestjs/config';
import jwtConfig from 'src/iam/infrastructure/config/jwt.config';
import { AuthSession } from 'src/iam/applications/ports/token.port';

/**
 * Le strict minimum d'un store adossé à Redis : de quoi tenter un `GETDEL`
 * atomique quand le driver l'expose, sans rien supposer d'autre. Décrit ici
 * parce que les types de cache-manager v7 ne l'exposent plus (cf.
 * `getAndDeleteOAuthCode`).
 */
interface RedisBackedStore {
  getClient?: () => { getdel?: (key: string) => Promise<string | null> };
}

/**
 * Ce qui ouvre ou prolonge une session : l'identifiant du refresh token en
 * cours, et le code à usage unique qui clôt un parcours OAuth.
 *
 * Les deux vont ensemble parce qu'ils portent la même chose — le droit d'être
 * connecté. Le code OAuth n'est qu'une session en transit : il est échangé
 * contre les tokens dans les trente secondes. Les tokens email
 * ([TokenEmailCacheService]) et les challenges MFA
 * ([MFAChallengeCacheService]) prouvent au contraire une possession, avant que
 * la session n'existe.
 */
@Injectable()
export class SessionCacheService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  // ── Refresh tokens ────────────────────────────────────────────────────────

  /**
   * Le TTL est repris de la durée de vie du refresh token : la config parle en
   * secondes, le cache en millisecondes.
   */
  async insertRefreshTokenId(
    email: string,
    refreshTokenId: string,
  ): Promise<void> {
    await this.cacheManager.set<string>(
      this.getRefreshTokenKey(email),
      refreshTokenId,
      this.jwtConfiguration.refreshTokenTtl * 1000,
    );
  }

  async validateRefreshToken(
    email: string,
    refreshTokenId: string,
  ): Promise<boolean> {
    const storedId = await this.cacheManager.get<string>(
      this.getRefreshTokenKey(email),
    );
    return storedId === refreshTokenId;
  }

  async invalidateRefreshTokenId(email: string): Promise<void> {
    await this.cacheManager.del(this.getRefreshTokenKey(email));
  }

  private getRefreshTokenKey(email: string) {
    return `refresh-${email}`;
  }

  // ── Codes OAuth ───────────────────────────────────────────────────────────

  /**
   * Le code OAuth à usage unique porte la session complète (tokens + compte)
   * et non les seuls tokens : au moment de l'échange, le contexte de
   * l'authentification sociale est perdu, et sans cela il faudrait relire le
   * compte en base pour renvoyer la même réponse que sign-in.
   */
  async insertOAuthCode(code: string, session: AuthSession): Promise<void> {
    await this.cacheManager.set(this.getOAuthCodeKey(code), session, 30_000);
  }

  async getAndDeleteOAuthCode(code: string): Promise<AuthSession | null> {
    const key = this.getOAuthCodeKey(code);

    // cache-manager v7 : la propriété `store` (singulier) n'existe plus dans
    // les types (c'est `stores`, un tableau de Keyv). L'accès brut au client
    // Redis reste tenté au runtime, d'où ce transtypage ; il ne réussit que si
    // un store Redis est effectivement câblé — ce qui n'est pas le cas
    // aujourd'hui, `CacheModule.register()` ne sélectionnant aucun driver.
    const { store } = this.cacheManager as unknown as {
      store?: RedisBackedStore;
    };
    const client = store?.getClient?.();

    if (client?.getdel) {
      // Lecture et suppression en une opération : un code OAuth ne doit pouvoir
      // être échangé qu'une fois, même si deux requêtes le présentent ensemble.
      const raw = await client.getdel(key);
      return raw ? (JSON.parse(raw) as AuthSession) : null;
    }

    // Repli non atomique. Acceptable ici : le code est à usage unique et vit
    // 30 secondes, et la fenêtre entre le `get` et le `del` est minuscule.
    const session = await this.cacheManager.get<AuthSession>(key);
    if (session) await this.cacheManager.del(key);
    return session ?? null;
  }

  private getOAuthCodeKey(code: string) {
    return `oauth-code:${code}`;
  }
}
