import { InvalidAccessTokenError } from 'src/iam/domain/errors';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenSignerAdapter } from 'src/shared/token/infrastructure/jwt-token-signer.adapter';
import { UNSUBSCRIBE_TOKEN_AUDIENCE } from '../../dto/auth-token';
import { TokenService } from './token.service';

const SECRET = 'test-secret';

const buildSignerConfig = () => ({
  secret: SECRET,
  audience: 'localhost:3000',
  issuer: 'localhost:3000',
});

const buildTtlConfig = () => ({
  accessTokenTtl: 3600,
  refreshTokenTtl: 86400,
  emailTokenTtl: 86400,
  unsubscribeTokenTtl: 7776000,
});

/**
 * Signer JWT réel : ces tests portent sur la politique de tokens d'IAM
 * (claims, audiences, cloisonnement), qui ne se vérifie qu'avec de vrais
 * tokens signés — pas sur le driver lui-même.
 */
const makeService = () => {
  // Une session par appareil : le store enregistre, valide et révoque par
  // couple (compte, identifiant de rotation).
  const sessionStore = {
    enregistrer: jest.fn(),
    estValide: jest.fn().mockResolvedValue(true),
    revoquer: jest.fn(),
    revoquerToutes: jest.fn(),
  };
  return new TokenService(
    new JwtTokenSignerAdapter(new JwtService(), buildSignerConfig() as any),
    sessionStore as any,
    buildTtlConfig() as any,
  );
};

describe('TokenService — confusion de tokens typés vs access tokens', () => {
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

  it('rejette un REFRESH token soumis comme access token', async () => {
    // Il ne porte pas de claim `type`, comme l'access token : c'est son
    // `refreshTokenId` qui le trahit. Sans ce contrôle, il ouvrait toutes les
    // routes protégées pendant 24 h — et sans jamais être consommé, la
    // rotation n'ayant lieu que sur la route de rafraîchissement.
    const service = makeService();
    const { refreshToken } = await service.generateTokens({
      sub: 42,
      email: 'user@example.com',
      role: 'investisseur',
      refreshTokenId: null,
    });

    await expect(service.verifyAccessToken(refreshToken)).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });

  it('laisse le rafraîchissement au seul chemin prévu pour lui', async () => {
    // Le symétrique : un access token ne rafraîchit rien, faute de
    // `refreshTokenId`. Les deux gardes se répondent.
    const service = makeService();
    const { accessToken } = await service.generateTokens({
      sub: 42,
      email: 'user@example.com',
      role: 'investisseur',
      refreshTokenId: null,
    });

    await expect(service.refreshTokens(accessToken)).rejects.toThrow();
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
