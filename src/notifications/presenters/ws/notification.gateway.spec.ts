import { JwtService } from '@nestjs/jwt';
import { TokenService } from 'src/iam/applications/services/token/token.service';
import { JwtTokenSignerAdapter } from 'src/shared/token/infrastructure/jwt-token-signer.adapter';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
import { NotificationGateway } from './notification.gateway';

const SECRET = 'test-secret';
const AUDIENCE = 'localhost:3000';

const buildSignerConfig = () => ({
  secret: SECRET,
  audience: AUDIENCE,
  issuer: AUDIENCE,
});

/**
 * Signer réel : ce qui est vérifié ici, c'est le CLOISONNEMENT des jetons à la
 * poignée de main, qui ne se démontre qu'avec de vrais jetons signés.
 */
const makeTokenService = () =>
  new TokenService(
    new JwtTokenSignerAdapter(new JwtService(), buildSignerConfig() as any),
    {
      insertRefreshTokenId: jest.fn(),
      validateRefreshToken: jest.fn().mockResolvedValue(true),
      invalidateRefreshTokenId: jest.fn(),
    } as any,
    {
      accessTokenTtl: 3600,
      refreshTokenTtl: 86400,
      emailTokenTtl: 86400,
      unsubscribeTokenTtl: 7776000,
      requireTypeClaim: true,
    } as any,
  );

const utilisateur = (status: UserStatus) => ({
  isSuspended: () => status === UserStatus.SUSPENDU,
  isClosed: () =>
    status === UserStatus.CLOS || status === UserStatus.SUPPRIME,
});

const makeGateway = (
  tokenService = makeTokenService(),
  status: UserStatus | null = UserStatus.ACTIF,
) => {
  const userRepository = {
    findById: jest
      .fn()
      .mockResolvedValue(status === null ? null : utilisateur(status)),
  };
  return {
    gateway: new NotificationGateway(tokenService, userRepository as any),
    userRepository,
  };
};

const makeClient = (token?: string) => ({
  handshake: { auth: { token }, headers: {} },
  data: {} as Record<string, unknown>,
  disconnect: jest.fn(),
  join: jest.fn().mockResolvedValue(undefined),
});

const signerAccessToken = async (tokenService: TokenService, sub = 42) => {
  const { accessToken } = await tokenService.generateTokens({
    sub,
    email: 'user@example.com',
    role: 'investisseur',
    refreshTokenId: null,
  });
  return accessToken;
};

describe('NotificationGateway — handleConnection', () => {
  it("accepte un access token légitime et rejoint la room de l'utilisateur", async () => {
    const tokenService = makeTokenService();
    const { gateway } = makeGateway(tokenService);
    const client = makeClient(await signerAccessToken(tokenService));

    await gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith('user-42');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('REJETTE un refresh token présenté à la poignée de main', async () => {
    const tokenService = makeTokenService();
    const { gateway } = makeGateway(tokenService);
    const { refreshToken } = await tokenService.generateTokens({
      sub: 42,
      email: 'user@example.com',
      refreshTokenId: null,
    });
    const client = makeClient(refreshToken);

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejette un token typé notif_unsubscribe (signé avec le même secret)', async () => {
    const tokenService = makeTokenService();
    const { gateway } = makeGateway(tokenService);
    const client = makeClient(await tokenService.generateUnsubscribeToken(42));

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejette un token typé email_verify', async () => {
    const tokenService = makeTokenService();
    const { gateway } = makeGateway(tokenService);
    const emailToken = await tokenService.generateEmailToken(
      { sub: 42, email: 'user@example.com', emailTokenId: 'id' },
      'email_verify',
    );
    const client = makeClient(emailToken);

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejette une connexion sans token', async () => {
    const { gateway } = makeGateway();
    const client = makeClient(undefined);

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it("rejette un token signé avec un autre secret", async () => {
    const tokenService = makeTokenService();
    const { gateway } = makeGateway(tokenService);
    const client = makeClient(
      new JwtService().sign(
        { sub: 42, type: 'access' },
        { secret: 'autre-secret', audience: AUDIENCE, issuer: AUDIENCE },
      ),
    );

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
  });

  describe('statut du compte relu en base (équivalent AccountStatusGuard)', () => {
    it.each([UserStatus.SUSPENDU, UserStatus.CLOS, UserStatus.SUPPRIME])(
      'refuse le canal à un compte %s malgré un access token valide',
      async (status) => {
        const tokenService = makeTokenService();
        const { gateway } = makeGateway(tokenService, status);
        const client = makeClient(await signerAccessToken(tokenService));

        await gateway.handleConnection(client as any);

        expect(client.disconnect).toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
      },
    );

    it('refuse le canal si le compte a disparu', async () => {
      const tokenService = makeTokenService();
      const { gateway } = makeGateway(tokenService, null);
      const client = makeClient(await signerAccessToken(tokenService));

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('accepte un compte encore en cours de vérification (cree)', async () => {
      const tokenService = makeTokenService();
      const { gateway } = makeGateway(tokenService, UserStatus.CREE);
      const client = makeClient(await signerAccessToken(tokenService));

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('user-42');
    });
  });
});
