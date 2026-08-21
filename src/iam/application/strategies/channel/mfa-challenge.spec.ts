import {
  NoActiveMfaMethodError,
  OtpDeliveryFailedError,
  UnsupportedMfaMethodError,
} from 'src/iam/domain/errors';
import { MfaMethodType } from 'src/iam/domain/enums/mfa-method.enum';
import { MfaMethod } from 'src/iam/domain/entities/mfa-method';

import { AuthMailerService } from 'src/iam/application/services/auth-mailer.service';
import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import { buildUser } from 'src/iam/domain/aggregates/user.fixture';
import { OtpService } from 'src/iam/application/services/otp/otp.service';
import type { SecretCipher } from 'src/iam/application/ports/secret-cipher.port';
import type { TotpGenerator } from 'src/iam/application/ports/totp-generator.port';

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

/**
 * Le compte porte ses facteurs : la stratégie le charge et y filtre son canal,
 * au lieu d'interroger un port qui n'existe plus.
 */
const makeChannelRepository = (methods: MfaMethod[] = []) => {
  const compte = buildUser({ facteurs: methods });
  return {
    compte,
    findByIdWithFacteurs: jest.fn().mockResolvedValue(compte),
    update: jest.fn().mockResolvedValue(undefined),
  };
};

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
    repository as unknown as UserRepository,
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
    repository as unknown as UserRepository,
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

    // Le retrait passe par le compte : c'est lui qu'on sauvegarde, avec son
    // facteur désormais inactif.
    expect(repository.update).toHaveBeenCalledWith(repository.compte);
    expect(repository.compte.facteursActifsDe(MfaMethodType.EMAIL)).toEqual([]);
    expect(otpService.invalidate).toHaveBeenCalledWith(
      `otp:mfa:${MfaMethodType.EMAIL}:${USER_ID}`,
    );
  });
});

describe('TotpChallengeStrategy', () => {
  const build = (methods: MfaMethod[]) => {
    const totpGenerator = { generate: jest.fn(), verify: jest.fn() };
    const repository = {
      findByIdWithFacteurs: jest
        .fn()
        .mockResolvedValue(buildUser({ facteurs: methods })),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const cipher = {
      encrypt: jest.fn(),
      decrypt: jest.fn((secret: string) => `clair:${secret}`),
    };

    const strategy = new TotpChallengeStrategy(
      totpGenerator as unknown as TotpGenerator,
      repository as unknown as UserRepository,
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

  /**
   * L'ordre de préférence est passé du service au compte : c'est `User` qui
   * dit quel facteur sera opposé, et le service ne fait plus que le lui
   * demander — une lecture au lieu d'une par canal.
   */
  const build = (
    facteurs: MfaMethod[],
    ...strategies: ReturnType<typeof stub>[]
  ) =>
    new MfaFactorService(
      strategies as unknown as MfaChallengeStrategy[],
      {
        findByIdWithFacteurs: jest
          .fn()
          .mockResolvedValue(buildUser({ facteurs })),
        update: jest.fn(),
      } as unknown as UserRepository,
    );

  const facteur = (method: MfaMethodType, id: number) =>
    MfaMethod.rehydrate({
      id,
      method,
      isActive: true,
      credential: method === MfaMethodType.TOTP ? 'secret' : ACCOUNT_EMAIL,
    });

  it('préfère TOTP quand plusieurs canaux sont actifs — ni envoi ni interception', async () => {
    const service = build([
      facteur(MfaMethodType.EMAIL, 1),
      facteur(MfaMethodType.SMS, 2),
      facteur(MfaMethodType.TOTP, 3),
    ]);

    await expect(service.findActiveMethod(USER_ID)).resolves.toBe(
      MfaMethodType.TOTP,
    );
  });

  it('préfère le SMS à l’email : la boîte email est ce que protège le mot de passe', async () => {
    const service = build([
      facteur(MfaMethodType.EMAIL, 1),
      facteur(MfaMethodType.SMS, 2),
    ]);

    await expect(service.findActiveMethod(USER_ID)).resolves.toBe(
      MfaMethodType.SMS,
    );
  });

  it('rend `null` quand le compte n’a aucun facteur — la connexion se poursuit sans MFA', async () => {
    const service = build([]);

    await expect(service.findActiveMethod(USER_ID)).resolves.toBeNull();
  });

  it('refuse un canal qu’aucune stratégie ne couvre', () => {
    const service = build([], stub(MfaMethodType.TOTP, true));

    expect(() => service.strategyFor(MfaMethodType.SMS)).toThrow(
      UnsupportedMfaMethodError,
    );
  });
});
