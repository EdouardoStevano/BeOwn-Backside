import { AuthSession, EmailTokenPurpose } from './token.port';

export const CACHE_MANAGER_SERVICE = Symbol('CACHE_MANAGER_SERVICE');

export interface CacheManagerService {
  insert<T>(key: string, data: T): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  remove(key: string): Promise<void>;
  // `purpose` namespaces the stored tokenId so an email-verify token and a
  // password-reset token issued for the same address never share a Redis
  // slot (they used to, back when only email-verify used this store —
  // requesting one flow could silently invalidate an in-flight request for
  // the other).
  validateEmailToken(
    email: string,
    emailTokenId: string,
    purpose: EmailTokenPurpose,
  ): Promise<boolean>;
  validateRefreshToken(email: string, refreshTokenId: string): Promise<boolean>;
  insertRefreshTokenId(email: string, refreshTokenId: string): Promise<void>;
  invalidateRefreshTokenId(email: string): Promise<void>;
  insertEmailTokenId(
    email: string,
    emailTokenId: string,
    purpose: EmailTokenPurpose,
  ): Promise<void>;
  invalidateEmailTokenId(
    email: string,
    purpose: EmailTokenPurpose,
  ): Promise<void>;
  /**
   * Le code OAuth à usage unique porte la session complète (tokens + compte)
   * et non les seuls tokens : au moment de l'échange, le contexte de
   * l'authentification sociale est perdu, et sans cela il faudrait relire le
   * compte en base pour renvoyer la même réponse que sign-in.
   */
  insertOAuthCode(code: string, session: AuthSession): Promise<void>;
  getAndDeleteOAuthCode(code: string): Promise<AuthSession | null>;
}
