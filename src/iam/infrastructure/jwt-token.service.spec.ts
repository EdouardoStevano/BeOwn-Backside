import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService, UNSUBSCRIBE_TOKEN_AUDIENCE } from './jwt-token.service';

const SECRET = 'test-secret';

const buildJwtConfig = () => ({
  secret: SECRET,
  audience: 'localhost:3000',
  issuer: 'localhost:3000',
  accessTokenTtl: 3600,
  refreshTokenTtl: 86400,
  emailTokenTtl: 86400,
  unsubscribeTokenTtl: 7776000,
});

const makeCache = () => ({
  insertRefreshTokenId: jest.fn(),
  validateRefreshToken: jest.fn(),
  invalidateRefreshTokenId: jest.fn(),
  insertEmailTokenId: jest.fn(),
  validateEmailToken: jest.fn(),
  invalidateEmailTokenId: jest.fn(),
});

const makeService = (cacheManagerService = makeCache()) =>
  new JwtTokenService(
    cacheManagerService as any,
    new JwtService(),
    buildJwtConfig() as any,
  );

describe('JwtTokenService — confusion de tokens typés vs access tokens', () => {
  it('accepte toujours un access token légitime (aucun claim type)', async () => {
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
      UnauthorizedException,
    );
  });

  it('rejette un token password_reset soumis comme access token', async () => {
    const service = makeService();
    const resetToken = await service.generateEmailToken(
      { sub: 42, email: 'user@example.com', emailTokenId: 'token-id' },
      'password_reset',
    );

    await expect(service.verifyAccessToken(resetToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("signe le token de désinscription avec l'audience dédiée (défense en profondeur)", async () => {
    const service = makeService();
    const token = await service.generateUnsubscribeToken(42);

    const decoded = new JwtService().decode(token) as Record<string, unknown>;
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

/**
 * Non-régression du correctif H-E : le refresh token ne portait aucun claim
 * `type`, donc il satisfaisait toutes les vérifications d'un access token.
 * Un refresh volé valait session complète — y compris APRÈS la
 * réinitialisation du mot de passe, qui n'invalide que la rotation (Redis).
 */
describe('JwtTokenService — refresh token vs access token (H-E)', () => {
  const generate = async (service: JwtTokenService) =>
    service.generateTokens({
      sub: 42,
      email: 'user@example.com',
      role: 'investisseur',
      refreshTokenId: null,
    });

  it('REJETTE un refresh token présenté comme access token', async () => {
    const service = makeService();
    const { refreshToken } = await generate(service);

    await expect(service.verifyAccessToken(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('le refresh token porte bien le claim `refresh` (et l’access aucun)', async () => {
    const service = makeService();
    const { accessToken, refreshToken } = await generate(service);

    const decodedRefresh = new JwtService().decode(refreshToken) as Record<string, unknown>;
    const decodedAccess = new JwtService().decode(accessToken) as Record<string, unknown>;

    expect(decodedRefresh.type).toBe('refresh');
    expect(decodedAccess.type).toBeUndefined();
  });

  it('la rotation nominale reste fonctionnelle avec le token typé', async () => {
    const cache = makeCache();
    cache.validateRefreshToken.mockResolvedValue(true);
    const service = makeService(cache);
    const { refreshToken } = await generate(service);

    const rotated = await service.refreshTokens(refreshToken);

    expect(rotated.accessToken).toBeDefined();
    expect(cache.invalidateRefreshTokenId).toHaveBeenCalled();
    // Le token issu de la rotation reste, lui aussi, inutilisable en Bearer.
    await expect(service.verifyAccessToken(rotated.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('REJETTE un access token soumis à la rotation (pas de refreshTokenId)', async () => {
    const cache = makeCache();
    cache.validateRefreshToken.mockResolvedValue(true);
    const service = makeService(cache);
    const { accessToken } = await generate(service);

    await expect(service.refreshTokens(accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(cache.validateRefreshToken).not.toHaveBeenCalled();
  });

  it('REJETTE un token typé email soumis à la rotation', async () => {
    const cache = makeCache();
    const service = makeService(cache);
    const resetToken = await service.generateEmailToken(
      { sub: 42, email: 'user@example.com', emailTokenId: 'token-id' },
      'password_reset',
    );

    await expect(service.refreshTokens(resetToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(cache.validateRefreshToken).not.toHaveBeenCalled();
  });
});
