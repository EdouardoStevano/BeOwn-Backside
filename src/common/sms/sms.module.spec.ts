jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: jest.fn() },
  }));
});

import { ConfigService } from '@nestjs/config';
import { smsServiceFactory } from './sms.module';
import { TwilioSmsService } from './twilio-sms.service';
import { NoopSmsService } from './noop-sms.service';

describe('smsServiceFactory', () => {
  const makeConfig = (env: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => env[key]),
      getOrThrow: jest.fn((key: string) => {
        const value = env[key];
        if (!value) throw new Error(`Missing env ${key}`);
        return value;
      }),
    }) as unknown as ConfigService;

  it('selects TwilioSmsService when all 3 Twilio env vars are present', () => {
    const config = makeConfig({
      TWILIO_ACCOUNT_SID: 'ACxxx',
      TWILIO_AUTH_TOKEN: 'authtoken',
      TWILIO_PHONE_NUMBER: '+10000000000',
    });

    const service = smsServiceFactory(config);

    expect(service).toBeInstanceOf(TwilioSmsService);
  });

  it('selects NoopSmsService when Twilio env vars are absent', () => {
    const config = makeConfig({});

    const service = smsServiceFactory(config);

    expect(service).toBeInstanceOf(NoopSmsService);
  });

  it.each([
    ['TWILIO_ACCOUNT_SID'],
    ['TWILIO_AUTH_TOKEN'],
    ['TWILIO_PHONE_NUMBER'],
  ])('falls back to NoopSmsService when %s is missing', (missingKey) => {
    const env: Record<string, string | undefined> = {
      TWILIO_ACCOUNT_SID: 'ACxxx',
      TWILIO_AUTH_TOKEN: 'authtoken',
      TWILIO_PHONE_NUMBER: '+10000000000',
    };
    delete env[missingKey];
    const config = makeConfig(env);

    const service = smsServiceFactory(config);

    expect(service).toBeInstanceOf(NoopSmsService);
  });
});
