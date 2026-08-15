import { TotpSecretService } from './totp-secret.service';
import type { ConfigService } from '@nestjs/config';
import type {
  TotpGenerator,
  TotpUriParams,
} from 'src/iam/applications/ports/totp-generator.port';

const build = (env: Record<string, string> = {}) => {
  const totpGenerator = {
    generateSecret: jest.fn().mockReturnValue('PLAIN-SECRET'),
    buildUri: jest.fn().mockReturnValue('otpauth://totp/x'),
    verify: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => env[key]),
    getOrThrow: jest.fn((key: string) => env[key]),
  };

  const service = new TotpSecretService(
    totpGenerator as unknown as TotpGenerator,
    configService as unknown as ConfigService,
  );

  const uriParams = (): TotpUriParams => {
    const [params] = totpGenerator.buildUri.mock.calls[0] as [TotpUriParams];
    return params;
  };

  return { service, totpGenerator, uriParams };
};

describe('TotpSecretService', () => {
  it('compose le secret avec l’émetteur lu en configuration', () => {
    const { service, uriParams } = build({ MFA_APP_NAME: 'BeOwn' });

    expect(service.create('user@example.com')).toEqual({
      secret: 'PLAIN-SECRET',
      uri: 'otpauth://totp/x',
    });
    expect(uriParams()).toMatchObject({
      issuer: 'BeOwn',
      label: 'user@example.com',
      secret: 'PLAIN-SECRET',
    });
  });

  it('accepte encore TFA_APP_NAME, l’ancien nom de variable', () => {
    // Renommer sans filet ferait échouer le démarrage des environnements déjà
    // déployés.
    const { service, uriParams } = build({ TFA_APP_NAME: 'BeOwn' });

    service.create('user@example.com');

    expect(uriParams().issuer).toBe('BeOwn');
  });

  it('déduit l’URL du logo d’API_URL quand MFA_LOGO_URL est absente', () => {
    const { service, uriParams } = build({
      MFA_APP_NAME: 'BeOwn',
      API_URL: 'https://api.beown.fr',
    });

    service.create('user@example.com');

    expect(uriParams().image).toBe(
      'https://api.beown.fr/images/beown_logo_circle.png',
    );
  });

  it('préfère MFA_LOGO_URL quand elle est renseignée', () => {
    const { service, uriParams } = build({
      MFA_APP_NAME: 'BeOwn',
      API_URL: 'https://api.beown.fr',
      MFA_LOGO_URL: 'https://cdn.beown.fr/logo.png',
    });

    service.create('user@example.com');

    expect(uriParams().image).toBe('https://cdn.beown.fr/logo.png');
  });

  it('n’ajoute aucun logo quand aucune URL n’est configurée', () => {
    const { service, uriParams } = build({ MFA_APP_NAME: 'BeOwn' });

    service.create('user@example.com');

    // `image` est hors spec : mieux vaut ne rien mettre qu'une URL injoignable
    // que le téléphone tentera de télécharger.
    expect(uriParams().image).toBeUndefined();
  });
});
