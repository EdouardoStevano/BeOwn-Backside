import {
  NoActiveMfaMethodError,
  OtpDeliveryFailedError,
  UnsupportedMfaMethodError,
} from 'src/iam/domains/errors';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { MfaMethod } from 'src/iam/domains/models/mfa-method';

import { AuthMailerService } from 'src/iam/applications/services/auth-mailer.service';
import type { MfaMethodRepository } from 'src/iam/domains/ports/mfa-method.repository';
import { OtpService } from 'src/iam/applications/services/otp/otp.service';
import type { SecretCipher } from 'src/iam/applications/ports/secret-cipher.port';
import type { TotpGenerator } from 'src/iam/applications/ports/totp-generator.port';

import type { SmsService } from 'src/shared/sms/sms.service';
import { EmailChallengeStrategy } from '../email/email-challenge.strategy';
import { SmsChallengeStrategy } from '../sms/sms-challenge.strategy';
import { TotpChallengeStrategy } from '../totp/totp-challenge.strategy';
import { MfaFactorService } from '../../services/mfa/mfa-factor.service';
import type { MfaChallengeStrategy } from '../mfa/mfa-challenge.strategy';

const USER_ID = 42;
const ACCOUNT_EMAIL = 'jean.dupont@example.com';
const PHONE = '+33612345678';

const makeOtpStore = () => ({
  generateOtp: jest.fn().mockResolvedValue('123456'),
  verifyOtp: jest.fn().mockResolvedValue(true),
  hasActiveOtp: jest.fn().mockResolvedValue(false),
  invalidate: jest.fn().mockResolvedValue(undefined),
});

const makeChannelRepository = (methods: MfaMethod[] = []) => ({
  create: jest.fn().mockResolvedValue(1),
  findAllByUserId: jest.fn().mockResolvedValue(methods),
  deletePendingForUser: jest.fn().mockResolvedValue(undefined),
  deactivateChannel: jest.fn().mockResolvedValue(undefined),
  deactivateAll: jest.fn().mockResolvedValue(undefined),
  activate: jest.fn().mockResolvedValue(undefined),
});

const activeEmail: MfaMethod = MfaMethod.rehydrate({
  id: 1,
  isActive: true,
  method: MfaMethodType.EMAIL,
  credential: ACCOUNT_EMAIL,
});
const activeSms: MfaMethod = MfaMethod.rehydrate({
  id: 2,
  isActive: true,
  method: MfaMethodType.SMS,
  credential: PHONE,
});

const buildEmail = (methods: MfaMethod[] = [activeEmail]) => {
  const otpService = makeOtpStore();
  const repository = makeChannelRepository(methods);
  const mailer = { sendLoginOtp: jest.fn().mockResolvedValue(undefined) };

  const strategy = new EmailChallengeStrategy(
    otpService as unknown as OtpService,
    repository as unknown as MfaMethodRepository,
    mailer as unknown as AuthMailerService,
  );

  return { strategy, otpService, repository, mailer };
};

const buildSms = (methods: MfaMethod[] = [activeSms]) => {
  const otpService = makeOtpStore();
  const repository = makeChannelRepository(methods);
  const sms = { sendOtp: jest.fn().mockResolvedValue(undefined) };

  const strategy = new SmsChallengeStrategy(
    otpService as unknown as OtpService,
    repository as unknown as MfaMethodRepository,
    sms as unknown as SmsService,
  );

  return { strategy, otpService, repository, sms };
};

describe('ChannelChallengeStrategy — canaux email et SMS', () => {
  it('émet le code vers la destination lue en base, jamais vers une valeur fournie', async () => {
    const { strategy, otpService, mailer } = buildEmail();

    const emission = await strategy.issue(USER_ID);

    expect(otpService.generateOtp).toHaveBeenCalledWith(
      `otp:mfa:${MfaMethodType.EMAIL}:${USER_ID}`,
    );
    expect(mailer.sendLoginOtp).toHaveBeenCalledWith(ACCOUNT_EMAIL, '123456');
    expect(emission.sentTo).toBe('j***t@example.com');
  });

  it('cloisonne sa clé OTP de celles de l’enrôlement et de la connexion', async () => {
    const { strategy, otpService } = buildSms();

    await strategy.issue(USER_ID);
    await strategy.verify(USER_ID, '123456');

    const [issuedKey] = otpService.generateOtp.mock.calls[0] as [string];
    const [verifiedKey] = otpService.verifyOtp.mock.calls[0] as [string];

    expect(issuedKey).toBe(`otp:mfa:${MfaMethodType.SMS}:${USER_ID}`);
    expect(verifiedKey).toBe(issuedKey);
    expect(issuedKey).not.toContain('otp:enroll');
  });

  it('masque la destination : reconnaissable par son titulaire, pas révélée', async () => {
    const { strategy: emailStrategy } = buildEmail();
    const { strategy: smsStrategy } = buildSms();

    expect((await emailStrategy.issue(USER_ID)).sentTo).toBe(
      'j***t@example.com',
    );
    expect((await smsStrategy.issue(USER_ID)).sentTo).toBe('+33*******78');
  });

  it('refuse d’émettre quand aucune méthode du canal n’est active', async () => {
    const { strategy, otpService } = buildEmail([
      MfaMethod.rehydrate({
        id: 1,
        isActive: false,
        method: MfaMethodType.EMAIL,
        credential: ACCOUNT_EMAIL,
      }),
    ]);

    await expect(strategy.issue(USER_ID)).rejects.toBeInstanceOf(
      NoActiveMfaMethodError,
    );
    expect(otpService.generateOtp).not.toHaveBeenCalled();
  });

  it('réémet sans attendre le TTL : ne pas recevoir son SMS ne doit pas fermer le compte', async () => {
    const { strategy, otpService } = buildSms();

    await strategy.issue(USER_ID);
    await strategy.issue(USER_ID);

    expect(otpService.hasActiveOtp).not.toHaveBeenCalled();
    expect(otpService.generateOtp).toHaveBeenCalledTimes(2);
  });

  it('invalide le code quand la remise échoue, pour autoriser un nouvel essai', async () => {
    const { strategy, otpService, sms } = buildSms();
    sms.sendOtp.mockRejectedValue(new Error('opérateur injoignable'));

    await expect(strategy.issue(USER_ID)).rejects.toBeInstanceOf(
      OtpDeliveryFailedError,
    );
    expect(otpService.invalidate).toHaveBeenCalledWith(
      `otp:mfa:${MfaMethodType.SMS}:${USER_ID}`,
    );
  });

  it('ne vérifie rien sur un canal inactif, même si le code serait bon', async () => {
    const { strategy, otpService } = buildEmail([]);

    await expect(strategy.verify(USER_ID, '123456')).resolves.toBe(false);
    expect(otpService.verifyOtp).not.toHaveBeenCalled();
  });

  it('désactive le canal et invalide le code en vol', async () => {
    const { strategy, otpService, repository } = buildEmail();

    await strategy.deactivate(USER_ID);

    expect(repository.deactivateChannel).toHaveBeenCalledWith(
      USER_ID,
      MfaMethodType.EMAIL,
    );
    expect(otpService.invalidate).toHaveBeenCalledWith(
      `otp:mfa:${MfaMethodType.EMAIL}:${USER_ID}`,
    );
  });
});

describe('TotpChallengeStrategy', () => {
  const build = (methods: MfaMethod[]) => {
    const totpGenerator = { generate: jest.fn(), verify: jest.fn() };
    const repository = {
      create: jest.fn(),
      findAllByUserId: jest.fn().mockResolvedValue(methods),
      deletePendingForUser: jest.fn(),
      deactivateChannel: jest.fn().mockResolvedValue(undefined),
      deactivateAll: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn(),
    };
    const cipher = {
      encrypt: jest.fn(),
      decrypt: jest.fn((secret: string) => `clair:${secret}`),
    };

    const strategy = new TotpChallengeStrategy(
      totpGenerator as unknown as TotpGenerator,
      repository as unknown as MfaMethodRepository,
      cipher as unknown as SecretCipher,
    );

    return { strategy, totpGenerator, repository, cipher };
  };

  it('n’envoie rien : le code est calculé par l’application de l’utilisateur', async () => {
    const { strategy } = build([
      MfaMethod.rehydrate({
        id: 1,
        isActive: true,
        method: MfaMethodType.TOTP,
        credential: 'chiffré',
      }),
    ]);

    await expect(strategy.issue()).resolves.toEqual({});
  });

  it('n’éprouve que les méthodes actives : un secret enrôlé mais non confirmé n’ouvre rien', async () => {
    const { strategy, totpGenerator } = build([
      MfaMethod.rehydrate({
        id: 1,
        isActive: false,
        method: MfaMethodType.TOTP,
        credential: 'en-attente',
      }),
    ]);
    totpGenerator.verify.mockResolvedValue(true);

    await expect(strategy.verify(USER_ID, '123456')).resolves.toBe(false);
    expect(totpGenerator.verify).not.toHaveBeenCalled();
  });

  it('déchiffre le secret actif le temps de la vérification', async () => {
    const { strategy, totpGenerator } = build([
      MfaMethod.rehydrate({
        id: 1,
        isActive: true,
        method: MfaMethodType.TOTP,
        credential: 'chiffré',
      }),
    ]);
    totpGenerator.verify.mockResolvedValue(true);

    await expect(strategy.verify(USER_ID, '123456')).resolves.toBe(true);
    expect(totpGenerator.verify).toHaveBeenCalledWith(
      '123456',
      'clair:chiffré',
    );
  });
});

describe('MfaFactorService', () => {
  const stub = (method: MfaMethodType, isActive: boolean) => ({
    method,
    isActiveFor: jest.fn().mockResolvedValue(isActive),
    issue: jest.fn().mockResolvedValue({}),
    verify: jest.fn(),
    deactivate: jest.fn(),
  });

  const build = (...strategies: ReturnType<typeof stub>[]) =>
    new MfaFactorService(strategies as unknown as MfaChallengeStrategy[]);

  it('préfère TOTP quand plusieurs canaux sont actifs — ni envoi ni interception', async () => {
    const service = build(
      stub(MfaMethodType.TOTP, true),
      stub(MfaMethodType.EMAIL, true),
      stub(MfaMethodType.SMS, true),
    );

    await expect(service.findActiveMethod(USER_ID)).resolves.toBe(
      MfaMethodType.TOTP,
    );
  });

  it('préfère le SMS à l’email : la boîte email est ce que protège le mot de passe', async () => {
    const service = build(
      stub(MfaMethodType.TOTP, false),
      stub(MfaMethodType.EMAIL, true),
      stub(MfaMethodType.SMS, true),
    );

    await expect(service.findActiveMethod(USER_ID)).resolves.toBe(
      MfaMethodType.SMS,
    );
  });

  it('rend `null` quand le compte n’a aucun facteur — la connexion se poursuit sans MFA', async () => {
    const service = build(
      stub(MfaMethodType.TOTP, false),
      stub(MfaMethodType.EMAIL, false),
      stub(MfaMethodType.SMS, false),
    );

    await expect(service.findActiveMethod(USER_ID)).resolves.toBeNull();
  });

  it('refuse un canal qu’aucune stratégie ne couvre', () => {
    const service = build(stub(MfaMethodType.TOTP, true));

    expect(() => service.strategyFor(MfaMethodType.SMS)).toThrow(
      UnsupportedMfaMethodError,
    );
  });
});
