import {
  NoActiveMfaMethodError,
  OtpDeliveryFailedError,
  UnsupportedTfaMethodError,
} from 'src/iam/domains/errors';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import type { ChannelTfaMethod } from 'src/iam/domains/models/channel-tfa-method';
import type { TotpMethod } from 'src/iam/domains/models/totp-method';
import type { AuthMailer } from 'src/iam/applications/ports/auth-mailer.port';
import type { ChannelTfaMethodRepository } from 'src/iam/domains/ports/channel-tfa-method.repository';
import type { OtpStore } from 'src/iam/applications/ports/otp-store.port';
import type { SecretCipher } from 'src/iam/applications/ports/secret-cipher.port';
import type { TotpGenerator } from 'src/iam/applications/ports/totp-generator.port';
import type { TotpMethodRepository } from 'src/iam/domains/ports/totp-method.repository';
import type { SmsService } from 'src/common/sms/sms.service';
import { EmailChallengeStrategy } from './email-challenge.strategy';
import { SmsChallengeStrategy } from './sms-challenge.strategy';
import { TotpChallengeStrategy } from './totp-challenge.strategy';
import { MfaFactorService } from '../services/mfa-factor.service';
import type { TfaChallengeStrategy } from './tfa-challenge.strategy';

const USER_ID = 42;
const ACCOUNT_EMAIL = 'jean.dupont@example.com';
const PHONE = '+33612345678';

const makeOtpStore = () => ({
  generateOtp: jest.fn().mockResolvedValue('123456'),
  verifyOtp: jest.fn().mockResolvedValue(true),
  hasActiveOtp: jest.fn().mockResolvedValue(false),
  invalidate: jest.fn().mockResolvedValue(undefined),
});

const makeChannelRepository = (methods: ChannelTfaMethod[] = []) => ({
  create: jest.fn().mockResolvedValue(1),
  findAllByUserId: jest.fn().mockResolvedValue(methods),
  deletePendingForUser: jest.fn().mockResolvedValue(undefined),
  deactivateAllForUser: jest.fn().mockResolvedValue(undefined),
  activate: jest.fn().mockResolvedValue(undefined),
});

const activeEmail: ChannelTfaMethod = {
  id: 1,
  isActive: true,
  target: ACCOUNT_EMAIL,
};
const activeSms: ChannelTfaMethod = { id: 2, isActive: true, target: PHONE };

const buildEmail = (methods: ChannelTfaMethod[] = [activeEmail]) => {
  const otpStore = makeOtpStore();
  const repository = makeChannelRepository(methods);
  const mailer = { sendLoginOtp: jest.fn().mockResolvedValue(undefined) };

  const strategy = new EmailChallengeStrategy(
    otpStore as unknown as OtpStore,
    repository as unknown as ChannelTfaMethodRepository,
    mailer as unknown as AuthMailer,
  );

  return { strategy, otpStore, repository, mailer };
};

const buildSms = (methods: ChannelTfaMethod[] = [activeSms]) => {
  const otpStore = makeOtpStore();
  const repository = makeChannelRepository(methods);
  const sms = { sendOtp: jest.fn().mockResolvedValue(undefined) };

  const strategy = new SmsChallengeStrategy(
    otpStore as unknown as OtpStore,
    repository as unknown as ChannelTfaMethodRepository,
    sms as unknown as SmsService,
  );

  return { strategy, otpStore, repository, sms };
};

describe('ChannelChallengeStrategy — canaux email et SMS', () => {
  it('émet le code vers la destination lue en base, jamais vers une valeur fournie', async () => {
    const { strategy, otpStore, mailer } = buildEmail();

    const emission = await strategy.issue(USER_ID);

    expect(otpStore.generateOtp).toHaveBeenCalledWith(
      `otp:mfa:${TfaMethodType.EMAIL}:${USER_ID}`,
    );
    expect(mailer.sendLoginOtp).toHaveBeenCalledWith(ACCOUNT_EMAIL, '123456');
    expect(emission.sentTo).toBe('j***t@example.com');
  });

  it('cloisonne sa clé OTP de celles de l’enrôlement et de la connexion', async () => {
    const { strategy, otpStore } = buildSms();

    await strategy.issue(USER_ID);
    await strategy.verify(USER_ID, '123456');

    const [issuedKey] = otpStore.generateOtp.mock.calls[0] as [string];
    const [verifiedKey] = otpStore.verifyOtp.mock.calls[0] as [string];

    expect(issuedKey).toBe(`otp:mfa:${TfaMethodType.SMS}:${USER_ID}`);
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
    const { strategy, otpStore } = buildEmail([
      { id: 1, isActive: false, target: ACCOUNT_EMAIL },
    ]);

    await expect(strategy.issue(USER_ID)).rejects.toBeInstanceOf(
      NoActiveMfaMethodError,
    );
    expect(otpStore.generateOtp).not.toHaveBeenCalled();
  });

  it('réémet sans attendre le TTL : ne pas recevoir son SMS ne doit pas fermer le compte', async () => {
    const { strategy, otpStore } = buildSms();

    await strategy.issue(USER_ID);
    await strategy.issue(USER_ID);

    expect(otpStore.hasActiveOtp).not.toHaveBeenCalled();
    expect(otpStore.generateOtp).toHaveBeenCalledTimes(2);
  });

  it('invalide le code quand la remise échoue, pour autoriser un nouvel essai', async () => {
    const { strategy, otpStore, sms } = buildSms();
    sms.sendOtp.mockRejectedValue(new Error('opérateur injoignable'));

    await expect(strategy.issue(USER_ID)).rejects.toBeInstanceOf(
      OtpDeliveryFailedError,
    );
    expect(otpStore.invalidate).toHaveBeenCalledWith(
      `otp:mfa:${TfaMethodType.SMS}:${USER_ID}`,
    );
  });

  it('ne vérifie rien sur un canal inactif, même si le code serait bon', async () => {
    const { strategy, otpStore } = buildEmail([]);

    await expect(strategy.verify(USER_ID, '123456')).resolves.toBe(false);
    expect(otpStore.verifyOtp).not.toHaveBeenCalled();
  });

  it('désactive le canal et invalide le code en vol', async () => {
    const { strategy, otpStore, repository } = buildEmail();

    await strategy.deactivate(USER_ID);

    expect(repository.deactivateAllForUser).toHaveBeenCalledWith(USER_ID);
    expect(otpStore.invalidate).toHaveBeenCalledWith(
      `otp:mfa:${TfaMethodType.EMAIL}:${USER_ID}`,
    );
  });
});

describe('TotpChallengeStrategy', () => {
  const build = (methods: TotpMethod[]) => {
    const totpGenerator = { generate: jest.fn(), verify: jest.fn() };
    const repository = {
      create: jest.fn(),
      findAllByUserId: jest.fn().mockResolvedValue(methods),
      deletePendingForUser: jest.fn(),
      deactivateAllForUser: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn(),
    };
    const cipher = {
      encrypt: jest.fn(),
      decrypt: jest.fn((secret: string) => `clair:${secret}`),
    };

    const strategy = new TotpChallengeStrategy(
      totpGenerator as unknown as TotpGenerator,
      repository as unknown as TotpMethodRepository,
      cipher as unknown as SecretCipher,
    );

    return { strategy, totpGenerator, repository, cipher };
  };

  it('n’envoie rien : le code est calculé par l’application de l’utilisateur', async () => {
    const { strategy } = build([
      { id: 1, isActive: true, encryptedSecret: 'chiffré' },
    ]);

    await expect(strategy.issue()).resolves.toEqual({});
  });

  it('n’éprouve que les méthodes actives : un secret enrôlé mais non confirmé n’ouvre rien', async () => {
    const { strategy, totpGenerator } = build([
      { id: 1, isActive: false, encryptedSecret: 'en-attente' },
    ]);
    totpGenerator.verify.mockResolvedValue(true);

    await expect(strategy.verify(USER_ID, '123456')).resolves.toBe(false);
    expect(totpGenerator.verify).not.toHaveBeenCalled();
  });

  it('déchiffre le secret actif le temps de la vérification', async () => {
    const { strategy, totpGenerator } = build([
      { id: 1, isActive: true, encryptedSecret: 'chiffré' },
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
  const stub = (method: TfaMethodType, isActive: boolean) => ({
    method,
    isActiveFor: jest.fn().mockResolvedValue(isActive),
    issue: jest.fn().mockResolvedValue({}),
    verify: jest.fn(),
    deactivate: jest.fn(),
  });

  const build = (...strategies: ReturnType<typeof stub>[]) =>
    new MfaFactorService(strategies as unknown as TfaChallengeStrategy[]);

  it('préfère TOTP quand plusieurs canaux sont actifs — ni envoi ni interception', async () => {
    const service = build(
      stub(TfaMethodType.TOTP, true),
      stub(TfaMethodType.EMAIL, true),
      stub(TfaMethodType.SMS, true),
    );

    await expect(service.findActiveMethod(USER_ID)).resolves.toBe(
      TfaMethodType.TOTP,
    );
  });

  it('préfère le SMS à l’email : la boîte email est ce que protège le mot de passe', async () => {
    const service = build(
      stub(TfaMethodType.TOTP, false),
      stub(TfaMethodType.EMAIL, true),
      stub(TfaMethodType.SMS, true),
    );

    await expect(service.findActiveMethod(USER_ID)).resolves.toBe(
      TfaMethodType.SMS,
    );
  });

  it('rend `null` quand le compte n’a aucun facteur — la connexion se poursuit sans MFA', async () => {
    const service = build(
      stub(TfaMethodType.TOTP, false),
      stub(TfaMethodType.EMAIL, false),
      stub(TfaMethodType.SMS, false),
    );

    await expect(service.findActiveMethod(USER_ID)).resolves.toBeNull();
  });

  it('refuse un canal qu’aucune stratégie ne couvre', () => {
    const service = build(stub(TfaMethodType.TOTP, true));

    expect(() => service.strategyFor(TfaMethodType.SMS)).toThrow(
      UnsupportedTfaMethodError,
    );
  });
});
