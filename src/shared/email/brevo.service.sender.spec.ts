import { BrevoEmailService } from './brevo.service';

describe("BrevoEmailService — résolution de l'expéditeur", () => {
  const templates = { render: jest.fn() } as any;
  const config = {
    getOrThrow: jest.fn().mockReturnValue('api-key'),
    get: jest.fn((k: string) =>
      k === 'BREVO_SENDER_EMAIL'
        ? 'env@beown.fr'
        : k === 'BREVO_SENDER_NAME'
          ? 'BeOwn'
          : k === 'FRONTEND_URL'
            ? 'http://localhost'
            : undefined,
    ),
  } as any;

  const setup = (adminFrom?: string) => {
    const platformSettings = {
      getDefaultEmailFrom: jest.fn().mockResolvedValue(adminFrom),
    } as any;
    return new BrevoEmailService(config, templates, platformSettings);
  };

  afterEach(() => jest.restoreAllMocks());

  const sentSender = async (svc: BrevoEmailService) => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, text: async () => '' } as any);
    await svc.sendTransactionalEmail('to@x.fr', 'Sujet', '<p>hi</p>');
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    return body.sender.email as string;
  };

  it("utilise l'expediteur admin quand defini", async () => {
    await expect(sentSender(setup('admin@beown.fr'))).resolves.toBe(
      'admin@beown.fr',
    );
  });

  it("retombe sur l'env quand l'admin ne definit rien", async () => {
    await expect(sentSender(setup(undefined))).resolves.toBe('env@beown.fr');
  });
});
