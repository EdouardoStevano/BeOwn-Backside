import { Inject } from '@nestjs/common';
import { CacheManagerService } from '../domain/ports/cahe-manager.service';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';

export class RedisCacheService implements CacheManagerService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async insert<T>(key: string, data: T): Promise<void> {
    await this.cacheManager.set(key, data);
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
}
