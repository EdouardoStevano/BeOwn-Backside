import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type ConfigType } from '@nestjs/config';
import { randomUUID } from 'crypto';
import jwtConfig from '../config/jwt.config';
import {
  AuthTokens,
  EmailTokenPayload,
  PasswordResetTokenPayload,
  TokenPayload,
  TokenService,
} from 'src/iam/domain/ports/token.service';
import {
  SESSION_TOKEN_STORE,
  type SessionTokenStore,
} from 'src/iam/domain/ports/session-token.store';
import { InvalidRefreshTokenError } from 'src/iam/domain/errors/iam.errors';

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(
    @Inject(SESSION_TOKEN_STORE)
    private readonly sessions: SessionTokenStore,

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

    await this.sessions.remember(payload.email, refreshTokenId);

    return { accessToken, refreshToken };
  }

  async refreshTokens(token: string): Promise<AuthTokens> {
    const { sub, email, role, refreshTokenId } =
      await this.jwtService.verifyAsync<Required<TokenPayload>>(token, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });

    // Rotation : le refresh token est à usage unique. S'il n'est plus celui que
    // l'on connaît, c'est un rejeu (ou une session révoquée) — on refuse.
    if (!refreshTokenId) {
      throw new InvalidRefreshTokenError();
    }
    if (!(await this.sessions.isCurrent(email, refreshTokenId))) {
      throw new InvalidRefreshTokenError();
    }
    await this.sessions.invalidate(email);

    return this.generateTokens({ sub, email, role });
  }

  verifyAccessToken(token: string): Promise<TokenPayload> {
    return this.jwtService.verifyAsync(token, this.jwtConfiguration);
  }

  generateEmailToken(payload: EmailTokenPayload): Promise<string> {
    return this.signToken<EmailTokenPayload>(
      payload.sub,
      this.jwtConfiguration.emailTokenTtl,
      payload,
    );
  }

  verifyEmailToken(token: string): Promise<EmailTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: this.jwtConfiguration.secret,
      audience: this.jwtConfiguration.audience,
      issuer: this.jwtConfiguration.issuer,
    });
  }

  generatePasswordResetToken(
    payload: PasswordResetTokenPayload,
  ): Promise<string> {
    return this.signToken<PasswordResetTokenPayload>(
      payload.sub,
      this.jwtConfiguration.passwordResetTtl,
      payload,
    );
  }

  async verifyPasswordResetToken(
    token: string,
  ): Promise<PasswordResetTokenPayload> {
    const payload =
      await this.jwtService.verifyAsync<PasswordResetTokenPayload>(token, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });

    // Tous nos tokens partagent le même secret : sans ce garde-fou, un token de
    // confirmation d'email (valable 24h) serait accepté ici comme token de reset.
    if (!payload.resetTokenId) {
      throw new Error('Not a password reset token');
    }

    return payload;
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
}
