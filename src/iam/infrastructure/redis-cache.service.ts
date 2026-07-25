import { Inject } from '@nestjs/common';
import { CacheManagerService } from '../domains/ports/cahe-manager.service';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { AuthTokens, EmailTokenPurpose } from '../domains/ports/token.service';
import jwtConfig from './config/jwt.config';
import { type ConfigType } from '@nestjs/config';

export class RedisCacheService implements CacheManagerService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async insert<T>(key: string, data: T): Promise<void> {
    await this.cacheManager.set(this.getKey(key), data);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return await this.cacheManager.get(this.getKey(key));
  }

  async remove(key: string): Promise<void> {
    await this.cacheManager.del(this.getKey(key));
  }

  private getKey(email: string) {
    return `user-${email}`;
  }

  async insertRefreshTokenId(email: string, refreshTokenId: string): Promise<void> {
    await this.cacheManager.set<string>(
      this.getRefreshTokenKey(email),
      refreshTokenId,
      this.jwtConfiguration.refreshTokenTtl * 1000,
    );
  }

  async validateRefreshToken(email: string, refreshTokenId: string): Promise<boolean> {
    const storedId = await this.cacheManager.get<string>(this.getRefreshTokenKey(email));
    return storedId === refreshTokenId;
  }

  async invalidateRefreshTokenId(email: string): Promise<void> {
    await this.cacheManager.del(this.getRefreshTokenKey(email));
  }

  private getRefreshTokenKey(email: string) {
    return `refresh-${email}`;
  }

  async insertEmailTokenId(
    email: string,
    emailTokenId: string,
    purpose: EmailTokenPurpose,
  ): Promise<void> {
    await this.cacheManager.set<string>(
      this.getEmailTokenId(email, purpose),
      emailTokenId,
      this.jwtConfiguration.emailTokenTtl * 1000,
    );
  }

  async validateEmailToken(
    email: string,
    emailTokenId: string,
    purpose: EmailTokenPurpose,
  ): Promise<boolean> {
    const storedId = await this.cacheManager.get<string>(
      this.getEmailTokenId(email, purpose),
    );
    return storedId === emailTokenId;
  }

  async invalidateEmailTokenId(email: string, purpose: EmailTokenPurpose): Promise<void> {
    await this.cacheManager.del(this.getEmailTokenId(email, purpose));
  }

  private getEmailTokenId(email: string, purpose: EmailTokenPurpose) {
    return `email-token-${purpose}-${email}`;
  }

  async insertOAuthCode(code: string, tokens: AuthTokens): Promise<void> {
    await this.cacheManager.set(`oauth-code:${code}`, tokens, 30_000);
  }

  async getAndDeleteOAuthCode(code: string): Promise<AuthTokens | null> {
    const key = `oauth-code:${code}`;
    // cache-manager v7 : la propriété `store` (singulier) n'existe plus dans les
    // types (c'est `stores`, un tableau de Keyv). L'accès brut au client Redis
    // reste possible au runtime si un store Redis est câblé ; sinon on retombe
    // sur le get+del non atomique ci-dessous (code OAuth à usage unique, TTL 30s).
    const store = (this.cacheManager as any).store;
    const client = store?.getClient?.();
    if (client?.getdel) {
      const raw = await client.getdel(key);
      return raw ? (JSON.parse(raw) as AuthTokens) : null;
    }

    // Fallback for non-Redis test stores. Production uses Redis GETDEL above.
    const tokens = await this.cacheManager.get<AuthTokens>(key);
    if (tokens) await this.cacheManager.del(key);
    return tokens ?? null;
  }
}
