import { AuthTokens } from './token.service';

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
  insertPasswordResetTokenId(email: string, resetTokenId: string): Promise<void>;
  validatePasswordResetToken(email: string, resetTokenId: string): Promise<boolean>;
  invalidatePasswordResetTokenId(email: string): Promise<void>;
  insertOAuthCode(code: string, tokens: AuthTokens): Promise<void>;
  getAndDeleteOAuthCode(code: string): Promise<AuthTokens | null>;
}
