import { Inject } from '@nestjs/common';
import { CacheManagerService } from '../domain/ports/cahe-manager.service';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';

export class RedisCacheService implements CacheManagerService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

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

  async insertRefreshTokenId(
    email: string,
    refreshTokenId: string,
  ): Promise<void> {
    const key = this.getRefreshTokenKey(email);
    await this.cacheManager.set<string>(key, refreshTokenId);
  }

  async validateRefreshToken(
    email: string,
    refreshTokenId: string,
  ): Promise<boolean> {
    const key = this.getRefreshTokenKey(email);
    const storedId = await this.cacheManager.get<string>(key);
    return storedId === refreshTokenId;
  }

  async invalidateRefreshTokenId(email: string): Promise<void> {
    const key = this.getRefreshTokenKey(email);
    await this.cacheManager.del(key);
  }

  private getRefreshTokenKey(email: string) {
    return `refresh-${email}`;
  }

  async insertEmailTokenId(email: string, emailTokenId: string): Promise<void> {
    const key = this.getEmailTokenId(email);
    await this.cacheManager.set<string>(key, emailTokenId);
  }

  async validateEmailToken(
    email: string,
    emailTokenId: string,
  ): Promise<boolean> {
    const storedId = await this.cacheManager.get<string>(this.getKey(email));
    return storedId === emailTokenId;
  }

  async invalidateEmailTokenId(email: string): Promise<void> {
    const key = this.getEmailTokenId(email);
    await this.cacheManager.del(key);
  }

  private getEmailTokenId(email: string) {
    return `user-${email}`;
  }
}
