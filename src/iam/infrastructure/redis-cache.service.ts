import { Inject } from '@nestjs/common';
import { CacheManagerService } from '../domains/ports/cahe-manager.service';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { AuthTokens } from '../domains/ports/token.service';
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

  async insertEmailTokenId(email: string, emailTokenId: string): Promise<void> {
    await this.cacheManager.set<string>(
      this.getEmailTokenId(email),
      emailTokenId,
      this.jwtConfiguration.emailTokenTtl * 1000,
    );
  }

  async validateEmailToken(email: string, emailTokenId: string): Promise<boolean> {
    const storedId = await this.cacheManager.get<string>(this.getEmailTokenId(email));
    return storedId === emailTokenId;
  }

  async invalidateEmailTokenId(email: string): Promise<void> {
    await this.cacheManager.del(this.getEmailTokenId(email));
  }

  private getEmailTokenId(email: string) {
    return `email-token-${email}`;
  }

  async insertPasswordResetTokenId(
    email: string,
    resetTokenId: string,
  ): Promise<void> {
    await this.cacheManager.set<string>(
      this.getPasswordResetKey(email),
      resetTokenId,
      this.jwtConfiguration.passwordResetTtl * 1000,
    );
  }

  async validatePasswordResetToken(
    email: string,
    resetTokenId: string,
  ): Promise<boolean> {
    const storedId = await this.cacheManager.get<string>(
      this.getPasswordResetKey(email),
    );
    return storedId === resetTokenId;
  }

  async invalidatePasswordResetTokenId(email: string): Promise<void> {
    await this.cacheManager.del(this.getPasswordResetKey(email));
  }

  private getPasswordResetKey(email: string) {
    return `pwd-reset-${email}`;
  }

  async insertOAuthCode(code: string, tokens: AuthTokens): Promise<void> {
    await this.cacheManager.set(`oauth-code:${code}`, tokens, 30_000);
  }

  async getAndDeleteOAuthCode(code: string): Promise<AuthTokens | null> {
    const tokens = await this.cacheManager.get<AuthTokens>(`oauth-code:${code}`);
    if (tokens) await this.cacheManager.del(`oauth-code:${code}`);
    return tokens ?? null;
  }
}
