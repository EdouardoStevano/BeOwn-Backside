import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type ConfigType } from '@nestjs/config';
import { randomUUID } from 'crypto';
import jwtConfig from '../config/jwt.config';
import {
  AuthTokens,
  EmailTokenPayload,
  NOTIF_UNSUBSCRIBE_TYPE,
  PasswordResetTokenPayload,
  TokenPayload,
  TokenService,
  TwoFactorChallengePayload,
  UnsubscribeTokenPayload,
} from 'src/iam/domain/ports/token.service';
import {
  SESSION_TOKEN_STORE,
  type SessionTokenStore,
} from 'src/iam/domain/ports/session-token.store';
import {
  InvalidOrExpiredTokenError,
  InvalidRefreshTokenError,
} from 'src/iam/domain/errors/iam.errors';

/**
 * Audience dédiée aux jetons de désinscription. Défense en profondeur : même
 * si un contrôle du claim `type` était oublié quelque part, un jeton signé
 * avec cette audience est structurellement rejeté par toute vérification
 * utilisant l'audience standard (access, refresh, email).
 */
export const UNSUBSCRIBE_TOKEN_AUDIENCE = 'beown-unsubscribe';

/**
 * Discriminant porté par tous les jetons qui ne sont PAS des jetons de session.
 * Access et refresh tokens n'en portent jamais : c'est ce qui permet à
 * `verifyAccessToken` de refuser tout le reste d'un seul test.
 */
const TokenType = {
  EMAIL_VERIFY: 'email_verify',
  PASSWORD_RESET: 'password_reset',
  TWO_FACTOR_CHALLENGE: 'two_factor_challenge',
} as const;

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

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    const payload: TokenPayload & { type?: string } =
      await this.jwtService.verifyAsync(token, this.jwtConfiguration);

    // Garde anti-confusion de jetons : tous nos jetons sont signés avec le même
    // secret, un lien de reset ou de désinscription serait donc accepté ici
    // comme Bearer token de la victime — celui de désinscription vaut 90 jours,
    // n'est pas à usage unique, et part en masse par email. Les jetons de
    // session ne portent jamais de claim `type` : tout jeton qui en porte un
    // est refusé.
    if (payload.type) {
      throw new InvalidOrExpiredTokenError();
    }

    return payload;
  }

  generateEmailToken(payload: EmailTokenPayload): Promise<string> {
    return this.signToken(payload.sub, this.jwtConfiguration.emailTokenTtl, {
      ...payload,
      type: TokenType.EMAIL_VERIFY,
    });
  }

  verifyEmailToken(token: string): Promise<EmailTokenPayload> {
    return this.verifyTyped<EmailTokenPayload>(token, TokenType.EMAIL_VERIFY);
  }

  generatePasswordResetToken(
    payload: PasswordResetTokenPayload,
  ): Promise<string> {
    return this.signToken(payload.sub, this.jwtConfiguration.passwordResetTtl, {
      ...payload,
      type: TokenType.PASSWORD_RESET,
    });
  }

  verifyPasswordResetToken(token: string): Promise<PasswordResetTokenPayload> {
    return this.verifyTyped<PasswordResetTokenPayload>(
      token,
      TokenType.PASSWORD_RESET,
    );
  }

  generateTwoFactorChallengeToken(
    payload: TwoFactorChallengePayload,
  ): Promise<string> {
    return this.signToken(
      payload.sub,
      this.jwtConfiguration.twoFactorChallengeTtl,
      { ...payload, type: TokenType.TWO_FACTOR_CHALLENGE },
    );
  }

  verifyTwoFactorChallengeToken(
    token: string,
  ): Promise<TwoFactorChallengePayload> {
    return this.verifyTyped<TwoFactorChallengePayload>(
      token,
      TokenType.TWO_FACTOR_CHALLENGE,
    );
  }

  /**
   * Pas d'identifiant mémorisé côté serveur, donc pas d'usage unique —
   * contrairement aux liens de vérification et de reset : on doit pouvoir
   * recliquer le lien d'un vieil email sans tomber sur une erreur, et l'action
   * est idempotente.
   *
   * Signé avec une audience DÉDIÉE (pas via `signToken`) : couplé au refus des
   * jetons typés dans `verifyAccessToken`, ce jeton ne peut structurellement
   * pas passer une vérification à l'audience standard.
   */
  generateUnsubscribeToken(userId: number): Promise<string> {
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

  /**
   * Vérifie la signature puis le claim `type`. Sans ce second contrôle, un lien
   * de confirmation d'email (24 h) servirait de jeton de réinitialisation de
   * mot de passe, et un access token suffirait à franchir l'étape 2FA.
   */
  private async verifyTyped<T>(
    token: string,
    expected: (typeof TokenType)[keyof typeof TokenType],
  ): Promise<T> {
    const payload = await this.jwtService.verifyAsync<T & { type?: string }>(
      token,
      {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      },
    );

    if (payload.type !== expected) {
      throw new InvalidOrExpiredTokenError();
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
