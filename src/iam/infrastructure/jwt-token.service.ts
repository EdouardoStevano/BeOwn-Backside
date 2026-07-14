import { Inject } from '@nestjs/common';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from '../domains/ports/cahe-manager.service';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { type ConfigType } from '@nestjs/config';
import {
  AuthTokens,
  EmailTokenPayload,
  EmailTokenPurpose,
  NOTIF_UNSUBSCRIBE_TYPE,
  TokenPayload,
  TokenService,
  UnsubscribeTokenPayload,
} from '../domains/ports/token.service';
import { randomUUID } from 'crypto';

export class JwtTokenService implements TokenService {
  constructor(
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,

    private readonly jwtService: JwtService,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async generateTokens(payload: TokenPayload): Promise<AuthTokens> {
    const refreshTokenId = randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
      this.signToken<{ email: string; role?: string }>(
        payload.sub,
        this.jwtConfiguration.accessTokenTtl,
        { email: payload.email, role: payload.role },
      ),

      this.signToken(payload.sub, this.jwtConfiguration.refreshTokenTtl, {
        refreshTokenId,
        email: payload.email,
        role: payload.role,
      }),
    ]);

    await this.cacheManagerService.insertRefreshTokenId(
      payload.email,
      refreshTokenId,
    );

    return { accessToken, refreshToken };
  }

  private signToken<T>(
    userId: number,
    expiresIn: number,
    payload?: T,
  ): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, ...payload },
      {
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
        expiresIn,
      },
    );
  }

  async refreshTokens(token: string): Promise<AuthTokens> {
    const { sub, email, role, refreshTokenId } =
      await this.jwtService.verifyAsync(token, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });

    const isValidToken = await this.cacheManagerService.validateRefreshToken(
      email,
      refreshTokenId,
    );

    if (isValidToken) {
      await this.cacheManagerService.invalidateRefreshTokenId(email);
    } else {
      throw new Error('Refresh token is no longer available!');
    }

    return this.generateTokens({
      sub,
      email,
      role,
    } as TokenPayload);
  }

  verifyAccessToken(token: string): Promise<TokenPayload> {
    return this.jwtService.verifyAsync(token, this.jwtConfiguration);
  }

  async generateEmailToken(
    emailTokenPayload: Omit<EmailTokenPayload, 'type'>,
    purpose: EmailTokenPurpose,
  ): Promise<string> {
    return this.signToken<EmailTokenPayload>(
      emailTokenPayload.sub,
      this.jwtConfiguration.emailTokenTtl,
      { ...emailTokenPayload, type: purpose },
    );
  }

  verifyEmailToken(token: string): Promise<EmailTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: this.jwtConfiguration.secret,
      audience: this.jwtConfiguration.audience,
      issuer: this.jwtConfiguration.issuer,
    });
  }

  /**
   * Token de désinscription marketing : pas d'identifiant en cache, donc pas
   * de single-use — contrairement aux tokens email. Un utilisateur doit
   * pouvoir recliquer le lien d'un vieil email sans tomber sur une erreur.
   * L'action est de toute façon idempotente et non destructive.
   */
  async generateUnsubscribeToken(userId: number): Promise<string> {
    return this.signToken<{ type: typeof NOTIF_UNSUBSCRIBE_TYPE }>(
      userId,
      this.jwtConfiguration.unsubscribeTokenTtl,
      { type: NOTIF_UNSUBSCRIBE_TYPE },
    );
  }

  verifyUnsubscribeToken(token: string): Promise<UnsubscribeTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: this.jwtConfiguration.secret,
      audience: this.jwtConfiguration.audience,
      issuer: this.jwtConfiguration.issuer,
    });
  }
}
