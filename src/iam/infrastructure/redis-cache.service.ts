import { Inject } from '@nestjs/common';
import { CacheManagerService } from '../domain/ports/cahe-manager.service';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';

export class RedisCacheService implements CacheManagerService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async insert<T>(key: string, data: T): Promise<void> {
    await this.cacheManager.set(key, data);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return await this.cacheManager.get(key);
  }

  async remove(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async insertRefreshTokenId(email: string, refreshTokenId: string): Promise<void> {
    await this.cacheManager.set<string>(this.refreshKey(email), refreshTokenId);
  }

  async validateRefreshToken(email: string, refreshTokenId: string): Promise<boolean> {
    const stored = await this.cacheManager.get<string>(this.refreshKey(email));
    return stored === refreshTokenId;
  }

  async invalidateRefreshTokenId(email: string): Promise<void> {
    await this.cacheManager.del(this.refreshKey(email));
  }

  async insertEmailTokenId(email: string, emailTokenId: string): Promise<void> {
    await this.cacheManager.set<string>(this.emailKey(email), emailTokenId);
  }

  async validateEmailToken(email: string, emailTokenId: string): Promise<boolean> {
    const stored = await this.cacheManager.get<string>(this.emailKey(email));
    return stored === emailTokenId;
  }

  async invalidateEmailTokenId(email: string): Promise<void> {
    await this.cacheManager.del(this.emailKey(email));
  }

  async insertTwoFactorSession(token: string, userId: number): Promise<void> {
    await this.cacheManager.set<number>(this.twoFactorKey(token), userId);
  }

  async getTwoFactorSession(token: string): Promise<number | undefined> {
    return await this.cacheManager.get<number>(this.twoFactorKey(token));
  }

  async removeTwoFactorSession(token: string): Promise<void> {
    await this.cacheManager.del(this.twoFactorKey(token));
  }

  private refreshKey(email: string): string {
    return `refresh:${email}`;
  }

  private emailKey(email: string): string {
    return `email-verify:${email}`;
  }

  private twoFactorKey(token: string): string {
    return `2fa-session:${token}`;
  }
}
