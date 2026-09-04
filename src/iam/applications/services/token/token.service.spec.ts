import { InvalidAccessTokenError } from 'src/iam/domains/errors';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenSignerAdapter } from 'src/shared/token/infrastructure/jwt-token-signer.adapter';
import { UNSUBSCRIBE_TOKEN_AUDIENCE } from '../../models/auth-token';
import { TokenService } from './token.service';

const SECRET = 'test-secret';

const buildSignerConfig = () => ({
  secret: SECRET,
  audience: 'localhost:3000',
  issuer: 'localhost:3000',
});

const buildTtlConfig = (requireTypeClaim = true) => ({
  accessTokenTtl: 3600,
  refreshTokenTtl: 86400,
  emailTokenTtl: 86400,
  unsubscribeTokenTtl: 7776000,
  requireTypeClaim,
});

/**
 * Signer JWT réel : ces tests portent sur la politique de tokens d'IAM
 * (claims, audiences, cloisonnement), qui ne se vérifie qu'avec de vrais
 * tokens signés — pas sur le driver lui-même.
 */
const makeCache = () => ({
  insertRefreshTokenId: jest.fn(),
  // Toujours valide côté cache : ces tests portent sur les CLAIMS, pas sur la
  // rotation — un refus doit donc venir du type de jeton, jamais du cache.
  validateRefreshToken: jest.fn().mockResolvedValue(true),
  invalidateRefreshTokenId: jest.fn(),
  insertEmailTokenId: jest.fn(),
  validateEmailToken: jest.fn(),
  invalidateEmailTokenId: jest.fn(),
});

const makeService = (requireTypeClaim = true) =>
  new TokenService(
    new JwtTokenSignerAdapter(new JwtService(), buildSignerConfig() as any),
    makeCache() as any,
    buildTtlConfig(requireTypeClaim) as any,
  );

/** Jeton « legacy » : émis avant l'ajout du claim `type`. */
const signLegacyToken = (payload: object) =>
  new JwtService().sign(payload, {
    secret: SECRET,
    audience: buildSignerConfig().audience,
    issuer: buildSignerConfig().issuer,
    expiresIn: 3600,
  });

describe('TokenService — cloisonnement access / refresh', () => {
  it("estampille l'access token `access` et le refresh token `refresh`", async () => {
    const service = makeService();
    const { accessToken, refreshToken } = await service.generateTokens({
      sub: 42,
      email: 'user@example.com',
      role: 'investisseur',
      refreshTokenId: null,
    });

    expect(new JwtService().decode(accessToken).type).toBe('access');
    expect(new JwtService().decode(refreshToken).type).toBe('refresh');
  });

  it('REFUSE un refresh token présenté comme access token (Bearer)', async () => {
    const service = makeService();
    const { refreshToken } = await service.generateTokens({
      sub: 42,
      email: 'user@example.com',
      role: 'super_admin',
      refreshTokenId: null,
    });

    // Sans cette garde, le refresh token valait Bearer 24 h durant : la
    // rétrogradation d'un rôle, qui ne prend effet qu'à la rotation, restait
    // contournable tout ce temps.
    await expect(service.verifyAccessToken(refreshToken)).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });

  it('REFUSE un access token présenté sur le chemin de rafraîchissement', async () => {
    const service = makeService();
    const { accessToken } = await service.generateTokens({
      sub: 42,
      email: 'user@example.com',
      refreshTokenId: null,
    });

    await expect(service.consumeRefreshToken(accessToken)).rejects.toThrow();
  });

  it('accepte le refresh token sur son propre chemin', async () => {
    const service = makeService();
    const { refreshToken } = await service.generateTokens({
      sub: 42,
      email: 'user@example.com',
      refreshTokenId: null,
    });

    await expect(service.consumeRefreshToken(refreshToken)).resolves.toEqual({
      sub: 42,
      email: 'user@example.com',
    });
  });

  describe('fenêtre de transition (JWT_REQUIRE_TYPE_CLAIM)', () => {
    it('refuse un jeton legacy sans claim type quand le claim est exigé (défaut)', async () => {
      const service = makeService(true);
      const legacy = signLegacyToken({ sub: 42, email: 'user@example.com' });

      await expect(service.verifyAccessToken(legacy)).rejects.toThrow(
        InvalidAccessTokenError,
      );
    });

    it('tolère un jeton legacy sans claim type quand la fenêtre est ouverte', async () => {
      const service = makeService(false);
      const legacy = signLegacyToken({ sub: 42, email: 'user@example.com' });

      await expect(service.verifyAccessToken(legacy)).resolves.toMatchObject({
        sub: 42,
      });
    });

    it("la fenêtre ouverte ne relâche PAS le refus d'un jeton typé refresh", async () => {
      const service = makeService(false);
      const { refreshToken } = await service.generateTokens({
        sub: 42,
        email: 'user@example.com',
        refreshTokenId: null,
      });

      await expect(service.verifyAccessToken(refreshToken)).rejects.toThrow(
        InvalidAccessTokenError,
      );
    });
  });
});

describe('TokenService — confusion de tokens typés vs access tokens', () => {
  it('accepte un access token légitime', async () => {
    const service = makeService();
    const { accessToken } = await service.generateTokens({
      sub: 42,
      email: 'user@example.com',
      role: 'investisseur',
      refreshTokenId: null,
    });

    const payload = await service.verifyAccessToken(accessToken);

    expect(payload.sub).toBe(42);
    expect(payload.email).toBe('user@example.com');
    expect(payload.role).toBe('investisseur');
  });

  it('rejette un token notif_unsubscribe soumis comme access token', async () => {
    const service = makeService();
    const unsubscribeToken = await service.generateUnsubscribeToken(42);

    await expect(service.verifyAccessToken(unsubscribeToken)).rejects.toThrow();
  });

  it('rejette un token email_verify soumis comme access token', async () => {
    const service = makeService();
    const emailToken = await service.generateEmailToken(
      { sub: 42, email: 'user@example.com', emailTokenId: 'token-id' },
      'email_verify',
    );

    await expect(service.verifyAccessToken(emailToken)).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });

  it('rejette un token password_reset soumis comme access token', async () => {
    const service = makeService();
    const resetToken = await service.generateEmailToken(
      { sub: 42, email: 'user@example.com', emailTokenId: 'token-id' },
      'password_reset',
    );

    await expect(service.verifyAccessToken(resetToken)).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });

  it("signe le token de désinscription avec l'audience dédiée (défense en profondeur)", async () => {
    const service = makeService();
    const token = await service.generateUnsubscribeToken(42);

    const decoded = new JwtService().decode(token);
    expect(decoded.aud).toBe(UNSUBSCRIBE_TOKEN_AUDIENCE);

    // Une vérification à l'audience standard (celle des tokens email) le
    // rejette structurellement, avant même tout contrôle du claim `type`.
    await expect(service.verifyEmailToken(token)).rejects.toThrow();
  });

  it("le flux nominal de désinscription reste fonctionnel avec l'audience dédiée", async () => {
    const service = makeService();
    const token = await service.generateUnsubscribeToken(42);

    const payload = await service.verifyUnsubscribeToken(token);

    expect(payload.sub).toBe(42);
    expect(payload.type).toBe('notif_unsubscribe');
  });
});
