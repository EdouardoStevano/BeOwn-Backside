import { Test } from '@nestjs/testing';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { SMS_SERVICE } from 'src/common/sms/sms.service';
import { OTP_SERVICE } from 'src/iam/domain/ports/otp.service';
import { ACCOUNT_GATEWAY } from 'src/iam/domain/ports/account.gateway';
import { AuthAccount } from 'src/iam/domain/models/auth-account';
import { OtpTarget } from 'src/iam/domain/value-objects/otp-target.vo';
import {
  AccountNotFoundError,
  InvalidOtpError,
  InvalidPhoneNumberError,
  OtpAlreadyActiveError,
  SmsDeliveryFailedError,
} from 'src/iam/domain/errors/iam.errors';
import otpConfig from 'src/iam/infrastructure/config/otp.config';

import {
  SendEmailOtpHandler,
  VerifyEmailOtpHandler,
} from './email-otp.handlers';
import { SendSmsOtpHandler, VerifySmsOtpHandler } from './sms-otp.handlers';
import { SetupTotpHandler, VerifyTotpHandler } from './totp.handlers';
import {
  SendEmailOtpCommand,
  SendSmsOtpCommand,
  SetupTotpCommand,
  VerifyEmailOtpCommand,
  VerifySmsOtpCommand,
  VerifyTotpCommand,
} from './otp.commands';

describe('otp use cases', () => {
  let commandBus: CommandBus;

  const otpService = {
    generate: jest.fn(),
    verify: jest.fn(),
    hasActiveChallenge: jest.fn(),
    invalidate: jest.fn(),
    generateTotpSecret: jest.fn(),
    verifyTotp: jest.fn(),
  };
  const accounts = {
    findByEmail: jest.fn(),
    findBySocialId: jest.fn(),
    register: jest.fn(),
    registerSocial: jest.fn(),
    verifyPassword: jest.fn(),
    changePassword: jest.fn(),
    markEmailAsVerified: jest.fn(),
  };
  const emailService = { sendOtpEmail: jest.fn() };
  const smsService = { sendOtp: jest.fn() };

  const account = new AuthAccount(1, 'a@b.com', true, true);

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        SendEmailOtpHandler,
        VerifyEmailOtpHandler,
        SendSmsOtpHandler,
        VerifySmsOtpHandler,
        SetupTotpHandler,
        VerifyTotpHandler,
        { provide: OTP_SERVICE, useValue: otpService },
        { provide: ACCOUNT_GATEWAY, useValue: accounts },
        { provide: EMAIL_SERVICE, useValue: emailService },
        { provide: SMS_SERVICE, useValue: smsService },
        {
          provide: otpConfig.KEY,
          useValue: { ttlSeconds: 300, maxAttempts: 3, appName: 'BeOwn' },
        },
      ],
    }).compile();
    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
  });

  describe('email OTP', () => {
    it('sends a code with an expiry label derived from the real TTL', async () => {
      accounts.findByEmail.mockResolvedValue(account);
      otpService.hasActiveChallenge.mockResolvedValue(false);
      otpService.generate.mockResolvedValue('123456');

      await commandBus.execute(new SendEmailOtpCommand('a@b.com'));

      expect(emailService.sendOtpEmail).toHaveBeenCalledWith(
        'a@b.com',
        '123456',
        '5 minutes',
      );
    });

    it('refuses to send a second code while one is still active', async () => {
      accounts.findByEmail.mockResolvedValue(account);
      otpService.hasActiveChallenge.mockResolvedValue(true);

      await expect(
        commandBus.execute(new SendEmailOtpCommand('a@b.com')),
      ).rejects.toThrow(OtpAlreadyActiveError);
      expect(otpService.generate).not.toHaveBeenCalled();
    });

    it('invalidates the code when the email fails, so the user can retry at once', async () => {
      accounts.findByEmail.mockResolvedValue(account);
      otpService.hasActiveChallenge.mockResolvedValue(false);
      otpService.generate.mockResolvedValue('123456');
      emailService.sendOtpEmail.mockRejectedValue(new Error('smtp'));

      await expect(
        commandBus.execute(new SendEmailOtpCommand('a@b.com')),
      ).rejects.toThrow();
      expect(otpService.invalidate).toHaveBeenCalled();
    });

    it('rejects an unknown account', async () => {
      accounts.findByEmail.mockResolvedValue(null);

      await expect(
        commandBus.execute(new SendEmailOtpCommand('ghost@b.com')),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('verifies a code', async () => {
      accounts.findByEmail.mockResolvedValue(account);
      otpService.verify.mockResolvedValue(true);

      await expect(
        commandBus.execute(new VerifyEmailOtpCommand('a@b.com', '123456')),
      ).resolves.toBe(true);
    });
  });

  describe('SMS OTP', () => {
    it('sends a code to a normalized E.164 number', async () => {
      otpService.hasActiveChallenge.mockResolvedValue(false);
      otpService.generate.mockResolvedValue('123456');

      await commandBus.execute(new SendSmsOtpCommand('+33 6 12 34 56 78'));

      // Les espaces sont retirés par le value object avant tout usage.
      expect(smsService.sendOtp).toHaveBeenCalledWith('+33612345678', '123456');
    });

    it('rejects a number that is not E.164', async () => {
      await expect(
        commandBus.execute(new SendSmsOtpCommand('0612345678')),
      ).rejects.toThrow(InvalidPhoneNumberError);
      expect(otpService.generate).not.toHaveBeenCalled();
    });

    it('invalidates the code when the SMS fails', async () => {
      otpService.hasActiveChallenge.mockResolvedValue(false);
      otpService.generate.mockResolvedValue('123456');
      smsService.sendOtp.mockRejectedValue(new Error('twilio'));

      await expect(
        commandBus.execute(new SendSmsOtpCommand('+33612345678')),
      ).rejects.toThrow(SmsDeliveryFailedError);
      expect(otpService.invalidate).toHaveBeenCalled();
    });

    it('verifies a code against the same normalized number', async () => {
      otpService.verify.mockResolvedValue(true);

      await expect(
        commandBus.execute(new VerifySmsOtpCommand('+33 612345678', '123456')),
      ).resolves.toBe(true);

      const [target] = otpService.verify.mock.calls[0] as [OtpTarget];
      expect(target.value).toBe('+33612345678');
    });
  });

  describe('TOTP', () => {
    it('returns a secret and its otpauth URI', async () => {
      accounts.findByEmail.mockResolvedValue(account);
      otpService.generateTotpSecret.mockReturnValue({
        uri: 'otpauth://x',
        secret: 'S',
      });

      await expect(
        commandBus.execute(new SetupTotpCommand('a@b.com')),
      ).resolves.toEqual({ uri: 'otpauth://x', secret: 'S' });
    });

    it('accepts a valid code', async () => {
      accounts.findByEmail.mockResolvedValue(account);
      otpService.verifyTotp.mockResolvedValue(true);

      await expect(
        commandBus.execute(new VerifyTotpCommand('a@b.com', '123456', 'S')),
      ).resolves.toBe(true);
    });

    it('rejects an invalid code', async () => {
      accounts.findByEmail.mockResolvedValue(account);
      // Régression : la vérification est asynchrone. Tant qu'elle n'était pas
      // awaitée, la Promise renvoyée était truthy et tout code passait.
      otpService.verifyTotp.mockResolvedValue(false);

      await expect(
        commandBus.execute(new VerifyTotpCommand('a@b.com', '000000', 'S')),
      ).rejects.toThrow(InvalidOtpError);
    });
  });
});
