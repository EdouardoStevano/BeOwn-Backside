import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { type ConfigType } from '@nestjs/config';
import jwtConfig from '../config/jwt.config';
import { AuthTokens } from 'src/iam/domain/ports/token.service';
import { SessionTokenStore } from 'src/iam/domain/ports/session-token.store';
import {
  OneTimeTokenPurpose,
  OneTimeTokenStore,
} from 'src/iam/domain/ports/one-time-token.store';
import { OAuthHandoffStore } from 'src/iam/domain/ports/oauth-handoff.store';

/** Durée de vie d'un code d'échange OAuth : le temps d'une redirection. */
const OAUTH_CODE_TTL_MS = 30_000;

/**
 * Adapter Redis des trois ports de stockage d'IAM.
 *
 * Les formats de clé sont ceux d'avant le refactor : les sessions et les liens
 * en cours de validité survivent au déploiement.
 */
@Injectable()
export class RedisTokenStore
  implements SessionTokenStore, OneTimeTokenStore, OAuthHandoffStore
{
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  // ─── SessionTokenStore ───────────────────────────────────────────────────

  async remember(email: string, refreshTokenId: string): Promise<void> {
    await this.cache.set<string>(
      RedisTokenStore.refreshKey(email),
      refreshTokenId,
      this.jwtConfiguration.refreshTokenTtl * 1000,
    );
  }

  async isCurrent(email: string, refreshTokenId: string): Promise<boolean> {
    const stored = await this.cache.get<string>(
      RedisTokenStore.refreshKey(email),
    );
    return stored === refreshTokenId;
  }

  async invalidate(email: string): Promise<void> {
    await this.cache.del(RedisTokenStore.refreshKey(email));
  }

  // ─── OneTimeTokenStore ───────────────────────────────────────────────────

  async issue(
    purpose: OneTimeTokenPurpose,
    email: string,
    tokenId: string,
  ): Promise<void> {
    await this.cache.set<string>(
      RedisTokenStore.oneTimeKey(purpose, email),
      tokenId,
      this.ttlFor(purpose) * 1000,
    );
  }

  async isPending(
    purpose: OneTimeTokenPurpose,
    email: string,
    tokenId: string,
  ): Promise<boolean> {
    const stored = await this.cache.get<string>(
      RedisTokenStore.oneTimeKey(purpose, email),
    );
    return stored === tokenId;
  }

  async consume(purpose: OneTimeTokenPurpose, email: string): Promise<void> {
    await this.cache.del(RedisTokenStore.oneTimeKey(purpose, email));
  }

  // ─── OAuthHandoffStore ───────────────────────────────────────────────────

  async storeCode(code: string, tokens: AuthTokens): Promise<void> {
    await this.cache.set(
      RedisTokenStore.oauthKey(code),
      tokens,
      OAUTH_CODE_TTL_MS,
    );
  }

  async consumeCode(code: string): Promise<AuthTokens | null> {
    const tokens = await this.cache.get<AuthTokens>(
      RedisTokenStore.oauthKey(code),
    );
    if (tokens) await this.cache.del(RedisTokenStore.oauthKey(code));
    return tokens ?? null;
  }

  // ─── Clés ────────────────────────────────────────────────────────────────

  private ttlFor(purpose: OneTimeTokenPurpose): number {
    switch (purpose) {
      case OneTimeTokenPurpose.PASSWORD_RESET:
        return this.jwtConfiguration.passwordResetTtl;
      case OneTimeTokenPurpose.TWO_FACTOR_CHALLENGE:
        return this.jwtConfiguration.twoFactorChallengeTtl;
      case OneTimeTokenPurpose.EMAIL_VERIFICATION:
        return this.jwtConfiguration.emailTokenTtl;
    }
  }

  private static refreshKey(email: string): string {
    return `refresh-${email}`;
  }

  private static oneTimeKey(
    purpose: OneTimeTokenPurpose,
    email: string,
  ): string {
    switch (purpose) {
      case OneTimeTokenPurpose.PASSWORD_RESET:
        return `pwd-reset-${email}`;
      case OneTimeTokenPurpose.TWO_FACTOR_CHALLENGE:
        return `2fa-challenge-${email}`;
      case OneTimeTokenPurpose.EMAIL_VERIFICATION:
        return `email-token-${email}`;
    }
  }

  private static oauthKey(code: string): string {
    return `oauth-code:${code}`;
  }
}
