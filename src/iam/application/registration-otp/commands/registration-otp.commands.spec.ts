import { Test } from '@nestjs/testing';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { AuthAccount } from 'src/iam/domain/models/auth-account';
import { AccountStatus } from 'src/iam/domain/enums/account-status.enum';
import { ACCOUNT_GATEWAY } from 'src/iam/domain/ports/account.gateway';
import { PHONE_DIRECTORY } from 'src/iam/domain/ports/phone.directory';
import {
  REGISTRATION_OTP_STORE,
  RegistrationOtpVerdict,
} from 'src/iam/domain/ports/registration-otp.store';
import { TOKEN_SERVICE } from 'src/iam/domain/ports/token.service';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { SMS_SERVICE } from 'src/common/sms/sms.service';
import {
  AccountClosedError,
  AccountSuspendedError,
  InvalidOtpError,
  PhoneNumberRequiredError,
  TooManyOtpAttemptsError,
} from 'src/iam/domain/errors/iam.errors';
import registrationOtpConfig from 'src/iam/infrastructure/config/registration-otp.config';
import { RegistrationOtpHandlers } from './registration-otp.handlers';
import {
  ResendRegistrationOtpCommand,
  SendRegistrationOtpCommand,
  VerifyRegistrationOtpCommand,
} from './registration-otp.commands';

const unverified = (status = AccountStatus.ACTIVE) =>
  new AuthAccount(42, 'user@example.com', false, true, status, 'investisseur');

const verified = () =>
  new AuthAccount(
    42,
    'user@example.com',
    true,
    true,
    AccountStatus.ACTIVE,
    'investisseur',
  );

describe("OTP d'inscription", () => {
  const accounts = {
    findByEmail: jest.fn(),
    findBySocialId: jest.fn(),
    register: jest.fn(),
    registerSocial: jest.fn(),
    verifyPassword: jest.fn(),
    changePassword: jest.fn(),
    markEmailAsVerified: jest.fn(),
  };
  const store = {
    issue: jest.fn(),
    verify: jest.fn(),
    invalidate: jest.fn(),
    isResendThrottled: jest.fn(),
  };
  const tokenService = { generateTokens: jest.fn() };
  const emailService = { sendOtpEmail: jest.fn() };
  const smsService = { sendOtp: jest.fn(), sendTransactional: jest.fn() };
  const phones = { findPhone: jest.fn() };

  let commandBus: CommandBus;

  beforeEach(async () => {
    jest.resetAllMocks();
    store.issue.mockResolvedValue('123456');
    store.isResendThrottled.mockResolvedValue(false);
    tokenService.generateTokens.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        ...RegistrationOtpHandlers,
        { provide: ACCOUNT_GATEWAY, useValue: accounts },
        { provide: REGISTRATION_OTP_STORE, useValue: store },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        { provide: EMAIL_SERVICE, useValue: emailService },
        { provide: SMS_SERVICE, useValue: smsService },
        { provide: PHONE_DIRECTORY, useValue: phones },
        {
          provide: registrationOtpConfig.KEY,
          useValue: {
            ttlSeconds: 600,
            maxAttempts: 5,
            resendCooldownSeconds: 60,
          },
        },
      ],
    }).compile();

    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
  });

  describe('envoi', () => {
    it('livre le code par email', async () => {
      await commandBus.execute(
        new SendRegistrationOtpCommand(42, 'user@example.com'),
      );

      expect(store.issue).toHaveBeenCalledWith('user@example.com');
      expect(emailService.sendOtpEmail).toHaveBeenCalledWith(
        'user@example.com',
        '123456',
        '10 minutes',
      );
    });

    it('livre le code par SMS sur le numéro connu du compte', async () => {
      phones.findPhone.mockResolvedValue('+33612345678');

      await commandBus.execute(
        new SendRegistrationOtpCommand(42, 'user@example.com', 'sms'),
      );

      expect(smsService.sendTransactional).toHaveBeenCalledWith(
        '+33612345678',
        expect.stringContaining('123456'),
      );
      expect(emailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('canal SMS sans numéro connu : refus, et aucun code émis', async () => {
      phones.findPhone.mockResolvedValue(null);

      await expect(
        commandBus.execute(
          new SendRegistrationOtpCommand(42, 'user@example.com', 'sms'),
        ),
      ).rejects.toBeInstanceOf(PhoneNumberRequiredError);
      expect(store.issue).not.toHaveBeenCalled();
    });

    it('échec de livraison : le code est invalidé pour permettre un retry immédiat', async () => {
      emailService.sendOtpEmail.mockRejectedValue(new Error('mail down'));

      await expect(
        commandBus.execute(
          new SendRegistrationOtpCommand(42, 'user@example.com'),
        ),
      ).rejects.toThrow('mail down');
      expect(store.invalidate).toHaveBeenCalledWith('user@example.com');
    });
  });

  describe('renvoi (contrat non énumérant)', () => {
    it('compte existant non vérifié : renvoie un code', async () => {
      accounts.findByEmail.mockResolvedValue(unverified());

      await expect(
        commandBus.execute(
          new ResendRegistrationOtpCommand('user@example.com'),
        ),
      ).resolves.toBeUndefined();
      expect(emailService.sendOtpEmail).toHaveBeenCalled();
    });

    it('adresse inconnue : résout sans rien envoyer', async () => {
      accounts.findByEmail.mockResolvedValue(null);

      await expect(
        commandBus.execute(
          new ResendRegistrationOtpCommand('nobody@example.com'),
        ),
      ).resolves.toBeUndefined();
      expect(store.issue).not.toHaveBeenCalled();
    });

    it('adresse déjà vérifiée : résout sans rien envoyer', async () => {
      accounts.findByEmail.mockResolvedValue(verified());

      await expect(
        commandBus.execute(
          new ResendRegistrationOtpCommand('user@example.com'),
        ),
      ).resolves.toBeUndefined();
      expect(store.issue).not.toHaveBeenCalled();
    });

    it('renvoi trop rapproché : résout sans rien envoyer', async () => {
      accounts.findByEmail.mockResolvedValue(unverified());
      store.isResendThrottled.mockResolvedValue(true);

      await expect(
        commandBus.execute(
          new ResendRegistrationOtpCommand('user@example.com'),
        ),
      ).resolves.toBeUndefined();
      expect(store.issue).not.toHaveBeenCalled();
    });

    it('échec de livraison : résout tout de même, erreur avalée', async () => {
      accounts.findByEmail.mockResolvedValue(unverified());
      emailService.sendOtpEmail.mockRejectedValue(new Error('mail down'));

      await expect(
        commandBus.execute(
          new ResendRegistrationOtpCommand('user@example.com'),
        ),
      ).resolves.toBeUndefined();
    });

    it('canal SMS sans numéro : seul échec qui remonte au client', async () => {
      accounts.findByEmail.mockResolvedValue(unverified());
      phones.findPhone.mockResolvedValue(null);

      await expect(
        commandBus.execute(
          new ResendRegistrationOtpCommand('user@example.com', 'sms'),
        ),
      ).rejects.toBeInstanceOf(PhoneNumberRequiredError);
    });
  });

  describe('vérification', () => {
    it('code valide : vérifie l’adresse et rend des tokens de session', async () => {
      accounts.findByEmail.mockResolvedValue(unverified());
      store.verify.mockResolvedValue(RegistrationOtpVerdict.OK);

      const tokens = await commandBus.execute(
        new VerifyRegistrationOtpCommand('user@example.com', '123456'),
      );

      expect(tokens).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      expect(accounts.markEmailAsVerified).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(tokenService.generateTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 42,
          email: 'user@example.com',
          role: 'investisseur',
        }),
      );
    });

    it('code invalide : refus, sans vérifier l’adresse', async () => {
      accounts.findByEmail.mockResolvedValue(unverified());
      store.verify.mockResolvedValue(RegistrationOtpVerdict.INVALID);

      await expect(
        commandBus.execute(
          new VerifyRegistrationOtpCommand('user@example.com', '000000'),
        ),
      ).rejects.toBeInstanceOf(InvalidOtpError);
      expect(accounts.markEmailAsVerified).not.toHaveBeenCalled();
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('code expiré : refus', async () => {
      accounts.findByEmail.mockResolvedValue(unverified());
      store.verify.mockResolvedValue(RegistrationOtpVerdict.EXPIRED);

      await expect(
        commandBus.execute(
          new VerifyRegistrationOtpCommand('user@example.com', '123456'),
        ),
      ).rejects.toBeInstanceOf(InvalidOtpError);
    });

    it('trop de tentatives : erreur dédiée', async () => {
      accounts.findByEmail.mockResolvedValue(unverified());
      store.verify.mockResolvedValue(RegistrationOtpVerdict.TOO_MANY_ATTEMPTS);

      await expect(
        commandBus.execute(
          new VerifyRegistrationOtpCommand('user@example.com', '123456'),
        ),
      ).rejects.toBeInstanceOf(TooManyOtpAttemptsError);
    });

    it('adresse inconnue : même refus générique, sans consulter le code', async () => {
      accounts.findByEmail.mockResolvedValue(null);

      await expect(
        commandBus.execute(
          new VerifyRegistrationOtpCommand('nobody@example.com', '123456'),
        ),
      ).rejects.toBeInstanceOf(InvalidOtpError);
      expect(store.verify).not.toHaveBeenCalled();
    });

    it('compte suspendu : code valide, mais aucun token', async () => {
      accounts.findByEmail.mockResolvedValue(
        unverified(AccountStatus.SUSPENDED),
      );
      store.verify.mockResolvedValue(RegistrationOtpVerdict.OK);

      await expect(
        commandBus.execute(
          new VerifyRegistrationOtpCommand('user@example.com', '123456'),
        ),
      ).rejects.toBeInstanceOf(AccountSuspendedError);
      expect(accounts.markEmailAsVerified).not.toHaveBeenCalled();
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('compte clôturé : code valide, mais aucun token', async () => {
      accounts.findByEmail.mockResolvedValue(unverified(AccountStatus.CLOSED));
      store.verify.mockResolvedValue(RegistrationOtpVerdict.OK);

      await expect(
        commandBus.execute(
          new VerifyRegistrationOtpCommand('user@example.com', '123456'),
        ),
      ).rejects.toBeInstanceOf(AccountClosedError);
      expect(accounts.markEmailAsVerified).not.toHaveBeenCalled();
    });
  });
});
