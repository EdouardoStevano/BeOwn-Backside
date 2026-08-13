import { Inject } from '@nestjs/common';
import { SessionCacheService } from 'src/iam/applications/services/session-cache.service';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from '../config/jwt.config';
import { type ConfigType } from '@nestjs/config';
import {
  AuthTokens,
  EmailTokenPayload,
  EmailTokenPurpose,
  NOTIF_UNSUBSCRIBE_TYPE,
  TokenPayload,
  TokenService,
  UnsubscribeTokenPayload,
} from '../../applications/ports/token.port';
import { randomUUID } from 'crypto';
import { InvalidAccessTokenError } from 'src/iam/domains/errors';

/**
 * Audience dédiée aux tokens de désinscription. Défense en profondeur : même
 * si un contrôle de claim `type` était oublié quelque part, un token signé
 * avec cette audience est structurellement rejeté par toute vérification
 * utilisant l'audience standard (access, refresh, email).
 */
export const UNSUBSCRIBE_TOKEN_AUDIENCE = 'beown-unsubscribe';

export class JwtTokenAdapter implements TokenService {
  constructor(
    private readonly sessionCache: SessionCacheService,

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

    await this.sessionCache.insertRefreshTokenId(
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

    const isValidToken = await this.sessionCache.validateRefreshToken(
      email,
      refreshTokenId,
    );

    if (isValidToken) {
      await this.sessionCache.invalidateRefreshTokenId(email);
    } else {
      throw new Error('Refresh token is no longer available!');
    }

    return this.generateTokens({
      sub,
      email,
      role,
    } as TokenPayload);
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    const payload: TokenPayload & { type?: string } =
      await this.jwtService.verifyAsync(token, this.jwtConfiguration);

    // Garde anti-confusion de token (finding CRITIQUE) : les tokens typés
    // (`email_verify`, `password_reset`, `notif_unsubscribe`) sont signés
    // avec le même secret et seraient sinon acceptés ici comme access tokens
    // — un lien de désinscription (90 j, non single-use, distribué en masse
    // par email) deviendrait un Bearer token de la victime. Les access et
    // refresh tokens légitimes ne portent JAMAIS de claim `type` (voir
    // generateTokens/signToken) : tout token qui en porte un est rejeté.
    if (payload.type) {
      throw new InvalidAccessTokenError();
    }

    return payload;
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
   *
   * Signé avec une audience DÉDIÉE (pas via signToken) : couplé au rejet des
   * tokens typés dans verifyAccessToken, ce token ne peut structurellement
   * pas être accepté par une vérification à l'audience standard.
   */
  async generateUnsubscribeToken(userId: number): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, type: NOTIF_UNSUBSCRIBE_TYPE },
      {
        audience: UNSUBSCRIBE_TOKEN_AUDIENCE,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
        expiresIn: this.jwtConfiguration.unsubscribeTokenTtl,
      },
    );
  }

  verifyUnsubscribeToken(token: string): Promise<UnsubscribeTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: this.jwtConfiguration.secret,
      audience: UNSUBSCRIBE_TOKEN_AUDIENCE,
      issuer: this.jwtConfiguration.issuer,
    });
  }
}
