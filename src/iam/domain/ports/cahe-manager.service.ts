export const CACHE_MANAGER_SERVICE = Symbol('CACHE_MANAGER_SERVICE');

export interface CacheManagerService {
  insert<T>(key: string, data: T): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  remove(key: string): Promise<void>;
  validateEmailToken(email: string, emailTokenId: string): Promise<boolean>;
  validateRefreshToken(email: string, refreshTokenId: string): Promise<boolean>;
  insertRefreshTokenId(email: string, refreshTokenId: string): Promise<void>;
  invalidateRefreshTokenId(email: string): Promise<void>;
  insertEmailTokenId(email: string, emailTokenId: string): Promise<void>;
  invalidateEmailTokenId(email: string): Promise<void>;
}
