import { JwtService } from '@nestjs/jwt';
import {
  JwtTokenService,
  UNSUBSCRIBE_TOKEN_AUDIENCE,
} from './jwt-token.service';
import { InvalidOrExpiredTokenError } from 'src/iam/domain/errors/iam.errors';

const SECRET = 'test-secret';

const buildJwtConfig = () => ({
  secret: SECRET,
  audience: 'localhost:3000',
  issuer: 'localhost:3000',
  accessTokenTtl: 3600,
  refreshTokenTtl: 86400,
  emailTokenTtl: 86400,
  passwordResetTtl: 1800,
  twoFactorChallengeTtl: 300,
  unsubscribeTokenTtl: 7776000,
});

const makeService = () => {
  const sessions = {
    remember: jest.fn(),
    isCurrent: jest.fn(),
    invalidate: jest.fn(),
  };
  return new JwtTokenService(
    sessions,
    new JwtService(),
    buildJwtConfig() as never,
  );
};

describe('JwtTokenService — confusion de tokens typés vs access tokens', () => {
  it('accepte toujours un access token légitime (aucun claim type)', async () => {
    const service = makeService();
    const { accessToken } = await service.generateTokens({
      sub: 42,
      email: 'user@example.com',
      role: 'investisseur',
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
    const emailToken = await service.generateEmailToken({
      sub: 42,
      email: 'user@example.com',
      emailTokenId: 'token-id',
    });

    await expect(service.verifyAccessToken(emailToken)).rejects.toThrow(
      InvalidOrExpiredTokenError,
    );
  });

  it('rejette un token password_reset soumis comme access token', async () => {
    const service = makeService();
    const resetToken = await service.generatePasswordResetToken({
      sub: 42,
      email: 'user@example.com',
      resetTokenId: 'token-id',
    });

    await expect(service.verifyAccessToken(resetToken)).rejects.toThrow(
      InvalidOrExpiredTokenError,
    );
  });

  it("rejette un lien de confirmation d'email rejoué comme lien de reset", async () => {
    const service = makeService();
    const emailToken = await service.generateEmailToken({
      sub: 42,
      email: 'user@example.com',
      emailTokenId: 'token-id',
    });

    await expect(service.verifyPasswordResetToken(emailToken)).rejects.toThrow(
      InvalidOrExpiredTokenError,
    );
  });

  it("signe le token de désinscription avec l'audience dédiée (défense en profondeur)", async () => {
    const service = makeService();
    const token = await service.generateUnsubscribeToken(42);

    const decoded = new JwtService().decode<{ aud: string }>(token);
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
