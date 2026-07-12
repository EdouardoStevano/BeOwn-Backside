import { Test } from '@nestjs/testing';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { OTP_SERVICE } from '../ports/otp.service';
import { SMS_SERVICE } from 'src/common/sms/sms.service';
import { USER_REPOSITORY } from 'src/users/applications/ports/repositories/user.repository';

import { SendEmailOtpHandler } from './send-email-otp.handler';
import { SendEmailOtpCommand } from './send-email-otp.command';
import { VerifyEmailOtpHandler } from './verify-email-otp.handler';
import { VerifyEmailOtpCommand } from './verify-email-otp.command';
import { SetupTotpHandler } from './setup-totp.handler';
import { SetupTotpCommand } from './setup-totp.command';
import { VerifyTotpHandler } from './verify-totp.handler';
import { VerifyTotpCommand } from './verify-totp.command';
import { SendSmsOtpHandler } from './send-sms-otp.handler';
import { SendSmsOtpCommand } from './send-sms-otp.command';
import { VerifySmsOtpHandler } from './verify-sms-otp.handler';
import { VerifySmsOtpCommand } from './verify-sms-otp.command';

describe('otp commands via CommandBus', () => {
  let commandBus: CommandBus;

  const otpService = {
    generateOtp: jest.fn(),
    verifyOtp: jest.fn(),
    hasActiveOtp: jest.fn(),
    invalidate: jest.fn(),
    generateSecretTotp: jest.fn(),
    verifyTotp: jest.fn(),
  };
  const userRepository = { findByEmail: jest.fn() };
  const mailerService = { sendMail: jest.fn() };
  const smsService = { sendOtp: jest.fn() };

  const knownUser = { userId: 1, userEmail: { email: 'a@b.com' } };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        SendEmailOtpHandler,
        VerifyEmailOtpHandler,
        SetupTotpHandler,
        VerifyTotpHandler,
        SendSmsOtpHandler,
        VerifySmsOtpHandler,
        { provide: OTP_SERVICE, useValue: otpService },
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: SMS_SERVICE, useValue: smsService },
        { provide: MailerService, useValue: mailerService },
      ],
    }).compile();
    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
  });

  describe('SendEmailOtpCommand', () => {
    it('mails the generated code to a known user', async () => {
      userRepository.findByEmail.mockResolvedValue(knownUser);
      otpService.hasActiveOtp.mockResolvedValue(false);
      otpService.generateOtp.mockResolvedValue('123456');

      await commandBus.execute(new SendEmailOtpCommand('a@b.com'));

      expect(otpService.generateOtp).toHaveBeenCalledWith('otp:email:a@b.com');
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.com' }),
      );
    });

    it('rejects an unknown user', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      await expect(
        commandBus.execute(new SendEmailOtpCommand('ghost@b.com')),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses when an OTP is still active', async () => {
      userRepository.findByEmail.mockResolvedValue(knownUser);
      otpService.hasActiveOtp.mockResolvedValue(true);
      await expect(
        commandBus.execute(new SendEmailOtpCommand('a@b.com')),
      ).rejects.toThrow(BadRequestException);
      expect(otpService.generateOtp).not.toHaveBeenCalled();
    });

    it('invalidates the OTP when the mail fails, so a retry is possible', async () => {
      userRepository.findByEmail.mockResolvedValue(knownUser);
      otpService.hasActiveOtp.mockResolvedValue(false);
      otpService.generateOtp.mockResolvedValue('123456');
      mailerService.sendMail.mockRejectedValue(new Error('smtp down'));

      await expect(
        commandBus.execute(new SendEmailOtpCommand('a@b.com')),
      ).rejects.toThrow(InternalServerErrorException);
      expect(otpService.invalidate).toHaveBeenCalledWith('otp:email:a@b.com');
    });
  });

  describe('VerifyEmailOtpCommand', () => {
    it('delegates to the otp service under the email key', async () => {
      userRepository.findByEmail.mockResolvedValue(knownUser);
      otpService.verifyOtp.mockResolvedValue(true);

      await expect(
        commandBus.execute(new VerifyEmailOtpCommand('a@b.com', '123456')),
      ).resolves.toBe(true);
      expect(otpService.verifyOtp).toHaveBeenCalledWith(
        'otp:email:a@b.com',
        '123456',
      );
    });

    it('rejects an unknown user', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      await expect(
        commandBus.execute(new VerifyEmailOtpCommand('ghost@b.com', '123456')),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('SetupTotpCommand', () => {
    it('returns the secret and uri for a known user', async () => {
      userRepository.findByEmail.mockResolvedValue(knownUser);
      otpService.generateSecretTotp.mockReturnValue({
        uri: 'otpauth://x',
        secret: 'S3CRET',
      });

      await expect(
        commandBus.execute(new SetupTotpCommand('a@b.com')),
      ).resolves.toEqual({ uri: 'otpauth://x', secret: 'S3CRET' });
    });

    it('rejects an unknown user', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      await expect(
        commandBus.execute(new SetupTotpCommand('ghost@b.com')),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('VerifyTotpCommand', () => {
    it('accepts a valid code', async () => {
      userRepository.findByEmail.mockResolvedValue(knownUser);
      otpService.verifyTotp.mockReturnValue(true);

      await expect(
        commandBus.execute(new VerifyTotpCommand('a@b.com', '123456', 'S3CRET')),
      ).resolves.toBe(true);
      expect(otpService.verifyTotp).toHaveBeenCalledWith('123456', 'S3CRET');
    });

    it('rejects an invalid code', async () => {
      userRepository.findByEmail.mockResolvedValue(knownUser);
      otpService.verifyTotp.mockReturnValue(false);

      await expect(
        commandBus.execute(new VerifyTotpCommand('a@b.com', '000000', 'S3CRET')),
      ).rejects.toThrow('Code TOTP invalide');
    });
  });

  describe('SendSmsOtpCommand', () => {
    it('normalizes the phone and sends the code', async () => {
      otpService.hasActiveOtp.mockResolvedValue(false);
      otpService.generateOtp.mockResolvedValue('123456');

      await commandBus.execute(new SendSmsOtpCommand('+33 6 12 34 56 78'));

      expect(otpService.generateOtp).toHaveBeenCalledWith(
        'otp:sms:+33612345678',
      );
      expect(smsService.sendOtp).toHaveBeenCalledWith(
        '+33612345678',
        '123456',
      );
    });

    it('rejects a non-E.164 number', async () => {
      await expect(
        commandBus.execute(new SendSmsOtpCommand('0612345678')),
      ).rejects.toThrow(BadRequestException);
      expect(otpService.generateOtp).not.toHaveBeenCalled();
    });

    it('invalidates the OTP when the SMS fails, so a retry is possible', async () => {
      otpService.hasActiveOtp.mockResolvedValue(false);
      otpService.generateOtp.mockResolvedValue('123456');
      smsService.sendOtp.mockRejectedValue(new Error('twilio down'));

      await expect(
        commandBus.execute(new SendSmsOtpCommand('+33612345678')),
      ).rejects.toThrow(InternalServerErrorException);
      expect(otpService.invalidate).toHaveBeenCalledWith(
        'otp:sms:+33612345678',
      );
    });
  });

  describe('VerifySmsOtpCommand', () => {
    it('verifies against the normalized phone key', async () => {
      otpService.verifyOtp.mockResolvedValue(true);

      await expect(
        commandBus.execute(
          new VerifySmsOtpCommand('+33 6 12 34 56 78', '123456'),
        ),
      ).resolves.toBe(true);
      expect(otpService.verifyOtp).toHaveBeenCalledWith(
        'otp:sms:+33612345678',
        '123456',
      );
    });
  });
});
