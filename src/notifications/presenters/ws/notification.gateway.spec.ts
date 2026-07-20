import { JwtService } from '@nestjs/jwt';
import { NotificationGateway } from './notification.gateway';

const SECRET = 'test-secret';
const jwt = new JwtService();

const makeGateway = () => {
  const configService = { get: jest.fn().mockReturnValue(SECRET) };
  return new NotificationGateway(new JwtService(), configService as any);
};

const makeClient = (token?: string) => ({
  handshake: { auth: { token }, headers: {} },
  data: {} as Record<string, unknown>,
  disconnect: jest.fn(),
  join: jest.fn().mockResolvedValue(undefined),
});

describe('NotificationGateway — handleConnection', () => {
  it("accepte un access token légitime et rejoint la room de l'utilisateur", async () => {
    const gateway = makeGateway();
    const token = jwt.sign(
      { sub: 42, email: 'user@example.com' },
      { secret: SECRET, expiresIn: 3600 },
    );
    const client = makeClient(token);

    await gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith('user-42');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejette un token typé notif_unsubscribe (signé avec le même secret)', async () => {
    const gateway = makeGateway();
    const token = jwt.sign(
      { sub: 42, type: 'notif_unsubscribe' },
      { secret: SECRET, expiresIn: 7776000 },
    );
    const client = makeClient(token);

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejette un token typé email_verify', async () => {
    const gateway = makeGateway();
    const token = jwt.sign(
      { sub: 42, email: 'user@example.com', emailTokenId: 'id', type: 'email_verify' },
      { secret: SECRET, expiresIn: 86400 },
    );
    const client = makeClient(token);

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejette une connexion sans token', async () => {
    const gateway = makeGateway();
    const client = makeClient(undefined);

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });
});
