jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: jest.fn() },
  }));
});

import { ConfigService } from '@nestjs/config';
import { resolveSmsDriver, smsServiceFactory } from './sms.module';
import { TwilioSmsService } from './twilio-sms.service';
import { LogSmsService } from './log-sms.service';

const TWILIO_ENV = {
  TWILIO_ACCOUNT_SID: 'ACxxx',
  TWILIO_AUTH_TOKEN: 'authtoken',
  TWILIO_PHONE_NUMBER: '+10000000000',
};

const makeConfig = (env: Record<string, string | undefined>) =>
  ({
    get: jest.fn((key: string) => env[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = env[key];
      if (!value) throw new Error(`Missing env ${key}`);
      return value;
    }),
  }) as unknown as ConfigService;

describe('resolveSmsDriver', () => {
  it('trace en local, même quand des identifiants Twilio traînent dans le .env', () => {
    // Le cas qui motivait le changement : la règle précédente choisissait à la
    // présence des identifiants, donc un poste de dev dont le `.env` en
    // contenait envoyait de vrais SMS, facturés, à de vrais numéros.
    expect(resolveSmsDriver(makeConfig(TWILIO_ENV))).toBe('log');
  });

  it('envoie réellement en production quand Twilio est configuré', () => {
    const config = makeConfig({ ...TWILIO_ENV, NODE_ENV: 'production' });

    expect(resolveSmsDriver(config)).toBe('twilio');
  });

  it.each([
    ['TWILIO_ACCOUNT_SID'],
    ['TWILIO_AUTH_TOKEN'],
    ['TWILIO_PHONE_NUMBER'],
  ])(
    'retombe sur les logs en production quand %s manque, plutôt que de bloquer le démarrage',
    (missingKey) => {
      const env: Record<string, string | undefined> = {
        ...TWILIO_ENV,
        NODE_ENV: 'production',
      };
      delete env[missingKey];

      expect(resolveSmsDriver(makeConfig(env))).toBe('log');
    },
  );

  it('laisse SMS_DRIVER forcer Twilio depuis un poste de dev', () => {
    const config = makeConfig({ ...TWILIO_ENV, SMS_DRIVER: 'twilio' });

    expect(resolveSmsDriver(config)).toBe('twilio');
  });

  it('laisse SMS_DRIVER imposer les logs en production', () => {
    const config = makeConfig({
      ...TWILIO_ENV,
      NODE_ENV: 'production',
      SMS_DRIVER: 'log',
    });

    expect(resolveSmsDriver(config)).toBe('log');
  });

  it('tolère la casse et les espaces autour de la valeur', () => {
    const config = makeConfig({ ...TWILIO_ENV, SMS_DRIVER: '  TWILIO ' });

    expect(resolveSmsDriver(config)).toBe('twilio');
  });

  it('ignore une valeur inconnue et retombe sur la règle par défaut', () => {
    const config = makeConfig({ ...TWILIO_ENV, SMS_DRIVER: 'vonage' });

    expect(resolveSmsDriver(config)).toBe('log');
  });
});

describe('smsServiceFactory', () => {
  it('monte le driver log en développement', () => {
    expect(smsServiceFactory(makeConfig(TWILIO_ENV))).toBeInstanceOf(
      LogSmsService,
    );
  });

  it('monte Twilio en production configurée', () => {
    const config = makeConfig({ ...TWILIO_ENV, NODE_ENV: 'production' });

    expect(smsServiceFactory(config)).toBeInstanceOf(TwilioSmsService);
  });

  it('ne casse pas le démarrage quand SMS_DRIVER=twilio sans identifiants', () => {
    // Construire `TwilioSmsService` sans identifiants ferait échouer le boot de
    // toute l'application pour un transport secondaire.
    const config = makeConfig({ SMS_DRIVER: 'twilio' });

    expect(smsServiceFactory(config)).toBeInstanceOf(LogSmsService);
  });
});

describe('LogSmsService', () => {
  const makeSut = (env: Record<string, string | undefined> = {}) => {
    const service = new LogSmsService(makeConfig(env));
    const logged: string[] = [];
    jest
      .spyOn(service['logger'], 'log')
      .mockImplementation((message: unknown) => logged.push(String(message)));
    jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation((message: unknown) => logged.push(String(message)));

    return { service, logged };
  };

  it('écrit le code en clair hors production — sans quoi le driver est inutile', () => {
    const { service, logged } = makeSut();

    return service.sendOtp('+33612345678', '123456').then(() => {
      expect(logged.join('\n')).toContain('123456');
      expect(logged.join('\n')).toContain('+33612345678');
    });
  });

  it("n'écrit jamais le code en production", async () => {
    // Ce driver n'est qu'un filet en production ; un OTP y serait un
    // identifiant de connexion en clair dans la stack de logs.
    //
    // Code volontairement absent du numéro : « 123456 » est un sous-ensemble
    // de « +33612345678 », et l'assertion aurait échoué sur le numéro lui-même.
    const { service, logged } = makeSut({ NODE_ENV: 'production' });

    await service.sendOtp('+33612345678', '987654');

    expect(logged.join('\n')).not.toContain('987654');
    expect(logged.join('\n')).toContain('Configurer Twilio');
  });

  it('ne lève jamais : un transport absent ne casse pas le parcours appelant', async () => {
    const { service } = makeSut();

    await expect(
      service.sendTransactional('+33612345678', 'coucou'),
    ).resolves.toBeUndefined();
  });
});
