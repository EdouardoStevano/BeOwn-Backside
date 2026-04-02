import { Inject } from '@nestjs/common';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from '../domain/ports/cahe-manager.service';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { type ConfigType } from '@nestjs/config';
import {
  AuthTokens,
  EmailTokenPayload,
  TokenPayload,
  TokenService,
} from '../domain/ports/token.service';
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
      this.signToken<{ email: string }>(
        payload.sub,
        this.jwtConfiguration.accessTokenTtl,
        { email: payload.email },
      ),

      this.signToken(payload.sub, this.jwtConfiguration.refreshTokenTtl, {
        refreshTokenId,
        email: payload.email,
      }),
    ]);

    await this.cacheManagerService.insert(payload.email, refreshTokenId);

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
    const { sub, email, refreshTokenId } = await this.jwtService.verifyAsync(
      token,
      {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      },
    );

    const isValidToken = await this.validateRefreshToken(email, refreshTokenId);

    if (isValidToken) {
      await this.cacheManagerService.remove(email);
    } else {
      throw new Error('Refresh token is no longer available!');
    }

    return this.generateTokens({
      sub,
      email,
    } as TokenPayload);
  }

  private async validateRefreshToken(email: string, refreshTokenId: string) {
    const tokenIdCache = await this.cacheManagerService.get<string>(email);
    return refreshTokenId === tokenIdCache;
  }

  verifyAccessToken(token: string): Promise<TokenPayload> {
    return this.jwtService.verifyAsync(token, this.jwtConfiguration);
  }

  async generateEmailToken(
    emailTokenPayload: EmailTokenPayload,
  ): Promise<string> {
    return this.signToken<EmailTokenPayload>(
      emailTokenPayload.sub,
      this.jwtConfiguration.emailTokenTtl,
      emailTokenPayload,
    );
  }

  verifyEmailToken(token: string): Promise<EmailTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: this.jwtConfiguration.secret,
      audience: this.jwtConfiguration.audience,
      issuer: this.jwtConfiguration.issuer,
    });
  }
}
