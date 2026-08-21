import { ConfigService } from '@nestjs/config';
import { resolveMailDriver } from './email-driver.provider';

const config = (env: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => env[key] }) as ConfigService;

describe('resolveMailDriver', () => {
  it('respecte MAIL_DRIVER quand il est valide', () => {
    for (const driver of ['brevo', 'nodemailer', 'mailpit'] as const) {
      expect(resolveMailDriver(config({ MAIL_DRIVER: driver }))).toBe(driver);
    }
  });

  it('normalise casse et espaces de MAIL_DRIVER', () => {
    expect(resolveMailDriver(config({ MAIL_DRIVER: '  MailPit ' }))).toBe(
      'mailpit',
    );
  });

  it('ignore un MAIL_DRIVER inconnu et applique la règle par défaut', () => {
    expect(
      resolveMailDriver(
        config({ MAIL_DRIVER: 'sendgrid', NODE_ENV: 'staging' }),
      ),
    ).toBe('nodemailer');
  });

  it('utilise nodemailer sur les environnements déployés', () => {
    for (const env of ['development', 'staging', 'production']) {
      expect(resolveMailDriver(config({ NODE_ENV: env }))).toBe('nodemailer');
    }
  });

  it('retombe sur mailpit hors environnement déployé', () => {
    // NODE_ENV absent = poste local ; `test` = suite Jest ou overlay de test.
    expect(resolveMailDriver(config({}))).toBe('mailpit');
    expect(resolveMailDriver(config({ NODE_ENV: 'test' }))).toBe('mailpit');
    expect(resolveMailDriver(config({ NODE_ENV: 'preview' }))).toBe('mailpit');
  });

  it('donne la priorité à MAIL_DRIVER sur NODE_ENV', () => {
    expect(
      resolveMailDriver(
        config({ MAIL_DRIVER: 'mailpit', NODE_ENV: 'production' }),
      ),
    ).toBe('mailpit');
  });
});
