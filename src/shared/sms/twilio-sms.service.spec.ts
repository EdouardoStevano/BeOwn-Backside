import { ConfigService } from '@nestjs/config';

const createMock = jest.fn();

jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

import Twilio from 'twilio';
import { TwilioSmsService } from './twilio-sms.service';

describe('TwilioSmsService', () => {
  const env: Record<string, string> = {
    TWILIO_ACCOUNT_SID: 'ACxxx',
    TWILIO_AUTH_TOKEN: 'authtoken',
    TWILIO_PHONE_NUMBER: '+10000000000',
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const value = env[key];
      if (!value) throw new Error(`Missing env ${key}`);
      return value;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    createMock.mockResolvedValue({ sid: 'SMxxx' });
  });

  it('builds the Twilio client from ConfigService creds', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const service = new TwilioSmsService(config);
    expect(Twilio).toHaveBeenCalledWith('ACxxx', 'authtoken');
  });

  it('sendOtp calls messages.create with {to, from, body}', async () => {
    const service = new TwilioSmsService(config);
    await service.sendOtp('+33612345678', '123456');

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.to).toBe('+33612345678');
    expect(arg.from).toBe('+10000000000');
    expect(arg.body).toContain('123456');
  });

  it('sendTransactional calls messages.create with {to, from, body}', async () => {
    const service = new TwilioSmsService(config);
    await service.sendTransactional('+33612345678', 'Bonjour depuis BeOwn');

    expect(createMock).toHaveBeenCalledWith({
      to: '+33612345678',
      from: '+10000000000',
      body: 'Bonjour depuis BeOwn',
    });
  });

  it('rejects a phone number without a leading + (E.164 required)', async () => {
    const service = new TwilioSmsService(config);

    await expect(
      service.sendTransactional('0612345678', 'Bonjour'),
    ).rejects.toThrow(/E\.164/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects an empty/garbage phone number', async () => {
    const service = new TwilioSmsService(config);

    await expect(service.sendOtp('not-a-phone', '123456')).rejects.toThrow(
      /E\.164/,
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('logs and rethrows when Twilio fails to send', async () => {
    const service = new TwilioSmsService(config);
    const twilioError = new Error('Twilio: invalid number');
    createMock.mockRejectedValueOnce(twilioError);

    await expect(
      service.sendTransactional('+33612345678', 'Bonjour'),
    ).rejects.toThrow(twilioError);
  });
});
