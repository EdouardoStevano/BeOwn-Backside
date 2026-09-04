import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { randomUUID } from 'crypto';
import jwtConfig from 'src/iam/infrastructure/config/jwt.config';
import { InvalidAccessTokenError } from 'src/iam/domains/errors';
import {
  TOKEN_SIGNER,
  type TokenSigner,
} from 'src/shared/token/applications/ports/token-signer.port';
import {
  ACCESS_TOKEN_TYPE,
  AuthTokens,
  EmailTokenPayload,
  EmailTokenPurpose,
  NOTIF_UNSUBSCRIBE_TYPE,
  REFRESH_TOKEN_TYPE,
  RefreshSessionIdentity,
  TokenPayload,
  UNSUBSCRIBE_TOKEN_AUDIENCE,
  UnsubscribeTokenPayload,
  accepteCommeJetonDacces,
  accepteCommeJetonDeRafraichissement,
} from '../../models/auth-token';
import { SessionCacheService } from '../session-cache.service';

/**
 * Tous les tokens du contexte IAM : session (accès/rafraîchissement), lien
 * email (vérification, réinitialisation) et désinscription marketing.
 *
 * Service **applicatif**, plus un port : ce qu'il contient — quels claims,
 * quelle durée de vie, quelle audience, quel identifiant en cache — relève de
 * la politique de sécurité d'IAM, pas du mécanisme de signature. Tant que ces
 * règles vivaient dans l'adapter JWT, changer de driver aurait obligé à les
 * réécrire à l'identique dans le nouvel adapter. Elles sont désormais au-dessus
 * du seul contrat réellement technique, `TOKEN_SIGNER` (§9 — Adapter), qui est
 * la seule chose à ré-implémenter pour changer de driver.
 */
@Injectable()
export class TokenService {
  constructor(
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: TokenSigner,

    private readonly sessionCache: SessionCacheService,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async generateTokens(payload: TokenPayload): Promise<AuthTokens> {
    const refreshTokenId = randomUUID();

    // Chaque jeton porte SON type. C'est ce qui empêche un refresh token de
    // valoir access token en `Authorization: Bearer` — cf.
    // `ACCESS_TOKEN_TYPE` pour le détail de la faille corrigée.
    const [accessToken, refreshToken] = await Promise.all([
      this.signToken<{ email: string; role?: string; type: string }>(
        payload.sub,
        this.jwtConfiguration.accessTokenTtl,
        { email: payload.email, role: payload.role, type: ACCESS_TOKEN_TYPE },
      ),

      this.signToken(payload.sub, this.jwtConfiguration.refreshTokenTtl, {
        refreshTokenId,
        email: payload.email,
        role: payload.role,
        type: REFRESH_TOKEN_TYPE,
      }),
    ]);

    await this.sessionCache.insertRefreshTokenId(payload.email, refreshTokenId);

    return { accessToken, refreshToken };
  }

  private signToken<T extends object>(
    userId: number,
    expiresIn: number,
    payload?: T,
  ): Promise<string> {
    return this.tokenSigner.sign({ sub: userId, ...payload }, { expiresIn });
  }

  /**
   * Éprouve un refresh token et **consomme** son tour de rotation : au retour,
   * l'identifiant présenté ne vaut plus rien.
   *
   * Ne rend QUE l'identité de la session ({@link RefreshSessionIdentity}), et
   * n'émet aucun token. C'est le correctif d'une faille : la méthode
   * `refreshTokens` qu'elle remplace re-signait le claim `role` de l'ancien
   * token sans jamais relire la base. Comme `JwtAuthGuard` et
   * `PermissionsGuard` prennent le rôle dans le token, un changement de rôle
   * par un administrateur (`PATCH /admin/investors/:userId/role`) n'avait aucun
   * effet tant que l'utilisateur rafraîchissait sa session : une rétrogradation
   * ou une révocation d'administrateur était contournable indéfiniment.
   *
   * L'émission du nouveau couple appartient donc à l'appelant, seul à connaître
   * le dépôt utilisateur — c'est lui qui relit le rôle et le statut réels avant
   * d'appeler `generateTokens` (§SRP : ce service tient la politique de tokens,
   * pas l'état des comptes).
   */
  async consumeRefreshToken(token: string): Promise<RefreshSessionIdentity> {
    const { sub, email, refreshTokenId, type } = await this.tokenSigner.verify<
      Omit<TokenPayload, 'type'> & { type?: string }
    >(token);

    // Un access token ne porte pas d'identifiant de rotation : présenté ici, il
    // est refusé comme n'importe quel refresh token périmé, sans interroger le
    // cache. Le typage l'impose désormais — `TOKEN_SIGNER` rend une charge
    // utile typée là où `verifyAsync` rendait `any`.
    //
    // Le claim `type` verrouille le sens inverse ET les jetons typés
    // (`email_verify`, `password_reset`, `notif_unsubscribe`) : le contrôle est
    // symétrique de celui de `verifyAccessToken`, de sorte qu'aucun jeton ne
    // puisse servir sur les deux chemins.
    const isValidToken =
      accepteCommeJetonDeRafraichissement(
        type,
        this.jwtConfiguration.requireTypeClaim,
      ) &&
      typeof refreshTokenId === 'string' &&
      (await this.sessionCache.validateRefreshToken(email, refreshTokenId));

    if (!isValidToken) {
      throw new Error('Refresh token is no longer available!');
    }

    // Rotation : l'identifiant courant est retiré du cache AVANT toute
    // relecture de compte, de sorte qu'un refresh token présenté deux fois ne
    // soit honoré qu'une fois, même si la suite du parcours échoue.
    await this.sessionCache.invalidateRefreshTokenId(email);

    return { sub, email };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    // `type` est relu en `string` libre, jamais en `SessionTokenType` : la
    // charge utile entrante n'est pas de confiance et peut porter n'importe
    // quelle valeur (`email_verify`, `notif_unsubscribe`, …). C'est la garde
    // ci-dessous qui la ramène dans le domaine attendu.
    const payload = await this.tokenSigner.verify<
      Omit<TokenPayload, 'type'> & { type?: string }
    >(token);

    // Garde anti-confusion de token (finding CRITIQUE) : tous les jetons du
    // contexte sont signés avec le même secret et la même audience. Sans claim
    // `type`, un lien de désinscription (90 j, non single-use, distribué en
    // masse par email) ou un REFRESH TOKEN présenté en Bearer valaient access
    // token. Seule l'estampille `access` ouvre désormais ce chemin.
    if (
      !accepteCommeJetonDacces(
        payload.type,
        this.jwtConfiguration.requireTypeClaim,
      )
    ) {
      throw new InvalidAccessTokenError();
    }

    // Sûr après la garde : `type` vaut ici `'access'` ou rien.
    return payload as TokenPayload;
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
    return this.tokenSigner.verify<EmailTokenPayload>(token);
  }

  /**
   * Token longue durée (90 j) porté par le lien « se désinscrire » des
   * diffusions marketing : pas d'identifiant en cache, donc pas de
   * single-use — contrairement aux tokens email. Un utilisateur doit pouvoir
   * recliquer le lien d'un vieil email sans tomber sur une erreur. L'action
   * est de toute façon idempotente et non destructive.
   *
   * Signé avec une audience DÉDIÉE : couplé au rejet des tokens typés dans
   * verifyAccessToken, ce token ne peut structurellement pas être accepté par
   * une vérification à l'audience standard.
   */
  async generateUnsubscribeToken(userId: number): Promise<string> {
    return this.tokenSigner.sign(
      { sub: userId, type: NOTIF_UNSUBSCRIBE_TYPE },
      {
        expiresIn: this.jwtConfiguration.unsubscribeTokenTtl,
        audience: UNSUBSCRIBE_TOKEN_AUDIENCE,
      },
    );
  }

  /** Vérifie signature/émetteur/audience/expiration. Le contrôle du claim `type` est fait par l'appelant. */
  verifyUnsubscribeToken(token: string): Promise<UnsubscribeTokenPayload> {
    return this.tokenSigner.verify<UnsubscribeTokenPayload>(token, {
      audience: UNSUBSCRIBE_TOKEN_AUDIENCE,
    });
  }
}
