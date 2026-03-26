import { JwtService } from '@nestjs/jwt';
import {
  AuthTokens,
  TokenPayload,
  TokenService,
} from '../domain/ports/token.service';
import { Inject } from '@nestjs/common';
import jwtConfig from '../config/jwt.config';
import { type ConfigType } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

export class JwtTokenService implements TokenService {
  constructor(
    private readonly jwtService: JwtService,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,

    private readonly redisService: RedisService,
  ) {}

  async generateTokens(payload: TokenPayload): Promise<AuthTokens> {
    const refreshTokenId = randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
      await this.signToken<{ email: string }>(
        payload.sub,
        this.jwtConfiguration.accessTokenTtl,
        { email: payload.email },
      ),
      this.signToken(payload.sub, this.jwtConfiguration.refreshTokenTtl, {
        tokenId: refreshTokenId,
      }),
    ]);

    this.redisService.insert(payload.email, refreshTokenId);

    return { accessToken, refreshToken };
  }

  async refreshTokens(token: string): Promise<AuthTokens> {
    const payload = (await this.jwtService.verifyAsync(token, {
      secret: this.jwtConfiguration.secret,
      audience: this.jwtConfiguration.audience,
      issuer: this.jwtConfiguration.issuer,
    })) as TokenPayload;

    if (!payload.refreshTokenId)
      throw new Error('Refresh token is no longer available');

    const isValid = await this.redisService.validateToken(
      payload.email,
      payload.refreshTokenId,
    );

    if (isValid) {
      await this.redisService.delete(payload.email);
    } else {
      throw new Error('Refresh token is no longer available!');
    }

    return this.generateTokens(payload);
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

  async verifyToken(token: string) {
    return this.jwtService.verifyAsync(token, this.jwtConfiguration);
  }
}
