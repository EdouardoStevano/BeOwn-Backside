import { Inject, UnauthorizedException } from '@nestjs/common';
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
  PRE_AUTH_TOKEN_TYPE,
  PreAuthTokenPayload,
  REFRESH_TOKEN_TYPE,
  TokenPayload,
  TokenService,
  UnsubscribeTokenPayload,
} from '../domains/ports/token.service';
import { randomUUID } from 'crypto';

/**
 * Audience dédiée aux tokens de désinscription. Défense en profondeur : même
 * si un contrôle de claim `type` était oublié quelque part, un token signé
 * avec cette audience est structurellement rejeté par toute vérification
 * utilisant l'audience standard (access, refresh, email).
 */
export const UNSUBSCRIBE_TOKEN_AUDIENCE = 'beown-unsubscribe';

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

      // `type: 'refresh'` : sans ce claim, le refresh token satisfait toutes
      // les vérifications d'un access token (cf. REFRESH_TOKEN_TYPE).
      this.signToken(payload.sub, this.jwtConfiguration.refreshTokenTtl, {
        refreshTokenId,
        email: payload.email,
        role: payload.role,
        type: REFRESH_TOKEN_TYPE,
      }),
    ]);

    await this.cacheManagerService.insertRefreshTokenId(
      payload.email,
      refreshTokenId,
    );

    return { accessToken, refreshToken };
  }

  /**
   * Fenêtre volontairement courte : le jeton ne couvre que la saisie du code
   * de second facteur, pas une session.
   */
  private static readonly PRE_AUTH_TOKEN_TTL_SECONDS = 300;

  async generatePreAuthToken(userId: number, email: string): Promise<string> {
    return this.signToken(
      userId,
      JwtTokenService.PRE_AUTH_TOKEN_TTL_SECONDS,
      { email, type: PRE_AUTH_TOKEN_TYPE },
    );
  }

  async verifyPreAuthToken(token: string): Promise<PreAuthTokenPayload> {
    const payload: PreAuthTokenPayload = await this.jwtService.verifyAsync(
      token,
      this.jwtConfiguration,
    );
    // Symétrique de verifyAccessToken : on refuse ici tout ce qui n'est pas
    // explicitement un pre-auth token, pour qu'un access ou refresh token ne
    // puisse pas être présenté à l'échange 2FA.
    if (payload.type !== PRE_AUTH_TOKEN_TYPE) {
      throw new UnauthorizedException('Token invalide');
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

  async refreshTokens(token: string): Promise<AuthTokens> {
    const { sub, email, role, refreshTokenId, type } =
      await this.jwtService.verifyAsync(token, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });

    // Seul un refresh token peut faire tourner une session : un access token
    // ou un token typé (email_verify / password_reset) est refusé ici.
    // `type === undefined` est toléré pour les refresh tokens émis AVANT
    // l'ajout du claim — fenêtre bornée au TTL refresh (24 h par défaut), et
    // sans perte de sécurité : un tel token est de toute façon déjà
    // utilisable comme Bearer jusqu'à son expiration. La rotation lui
    // substitue immédiatement un token typé. À retirer après une fenêtre
    // > refreshTokenTtl écoulée depuis le déploiement.
    if (type !== undefined && type !== REFRESH_TOKEN_TYPE) {
      throw new UnauthorizedException('Token invalide');
    }
    if (!refreshTokenId) {
      throw new UnauthorizedException('Token invalide');
    }

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

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    const payload: TokenPayload & { type?: string } =
      await this.jwtService.verifyAsync(token, this.jwtConfiguration);

    // Garde anti-confusion de token (finding CRITIQUE) : les tokens typés
    // (`email_verify`, `password_reset`, `notif_unsubscribe`) sont signés
    // avec le même secret et seraient sinon acceptés ici comme access tokens
    // — un lien de désinscription (90 j, non single-use, distribué en masse
    // par email) deviendrait un Bearer token de la victime. Depuis le
    // correctif H-E, le refresh token porte lui aussi un claim (`refresh`) et
    // tombe donc sous la même garde : seul l'access token n'en porte aucun
    // (voir generateTokens/signToken). Tout token typé est rejeté ici.
    if (payload.type) {
      throw new UnauthorizedException('Token invalide');
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
