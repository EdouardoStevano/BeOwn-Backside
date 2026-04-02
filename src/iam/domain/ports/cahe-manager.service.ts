export const CACHE_MANAGER_SERVICE = Symbol('CACHE_MANAGER_SERVICE');

export interface CacheManagerService {
  insert<T>(key: string, data: T): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  remove(key: string): Promise<void>;
  validateEmailToken(email: string, emailTokenId: string): Promise<boolean>;
}
