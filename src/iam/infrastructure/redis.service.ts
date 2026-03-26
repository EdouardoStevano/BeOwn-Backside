import { CacheService } from '../domain/ports/cache.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { type Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';

export class RedisService implements CacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async insert<T>(email: string, data: T): Promise<void> {
    const key = this.getKey(email);
    await this.cacheManager.set(key, data);
  }

  async validateToken(email: string, tokenId: string): Promise<boolean> {
    const storeId = await this.cacheManager.get(this.getKey(email));
    return storeId === tokenId;
  }

  async delete(email: string): Promise<void> {
    await this.cacheManager.del(this.getKey(email));
  }

  private getKey(email: string): string {
    return `user-${email}`;
  }
}
