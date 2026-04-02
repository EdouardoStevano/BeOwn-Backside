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
  TokenPayload,
  TokenService,
} from '../domain/ports/token.service';
import { randomUUID } from 'crypto';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';

export class JwtTokenService implements TokenService {
  constructor(
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,

    private readonly jwtService: JwtService,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,

    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
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
    const { sub, refreshTokenId } = await this.jwtService.verifyAsync(token, {
      secret: this.jwtConfiguration.secret,
      audience: this.jwtConfiguration.audience,
      issuer: this.jwtConfiguration.issuer,
    });

    const user = await this.usersRepository.findById(sub);

    if (!user) {
      throw new Error('Refresh token is invalid');
    }

    const isValidToken = await this.validateRefreshToken(
      user.userEmail.email!,
      refreshTokenId,
    );

    if (isValidToken) {
      await this.cacheManagerService.remove(user.userEmail.email!);
    } else {
      throw new Error('Refresh token is no longer available!');
    }

    return this.generateTokens({
      sub: user.userId,
      email: user.userEmail.email!,
    } as TokenPayload);
  }

  private async validateRefreshToken(email: string, refreshTokenId: string) {
    const tokenIdCache = await this.cacheManagerService.get<string>(email);
    return refreshTokenId === tokenIdCache;
  }

  verifyAccessToken(token: string): Promise<TokenPayload> {
    return this.jwtService.verifyAsync(token, this.jwtConfiguration);
  }
}
