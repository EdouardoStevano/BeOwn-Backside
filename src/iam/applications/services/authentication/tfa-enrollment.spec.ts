import {
  InvalidOtpCodeError,
  InvalidPhoneNumberError,
  InvalidTotpCodeError,
  MissingPhoneNumberError,
  OtpAlreadyActiveError,
  OtpDeliveryFailedError,
  TfaEnrollmentNotStartedError,
  TfaMethodAlreadyEnrolledError,
  TotpNotConfiguredError,
  UnsupportedTfaMethodError,
} from 'src/iam/domains/errors';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import type { ChannelTfaMethod } from 'src/iam/domains/models/channel-tfa-method';
import type { TotpMethod } from 'src/iam/domains/models/totp-method';
import type { AuthMailer } from 'src/iam/domains/ports/auth-mailer.port';
import type { ChannelTfaMethodRepository } from 'src/iam/domains/ports/channel-tfa-method.repository';
import type { OtpStore } from 'src/iam/domains/ports/otp-store.port';
import type { SecretCipher } from 'src/iam/domains/ports/secret-cipher.port';
import type { TotpGenerator } from 'src/iam/domains/ports/totp-generator.port';
import type { TotpMethodRepository } from 'src/iam/domains/ports/totp-method.repository';
import type { UserRepository } from 'src/iam/domains/ports/user.repository';
import type { SmsService } from 'src/common/sms/sms.service';
import { buildUser } from 'src/iam/domains/models/user.fixture';
import { EmailEnrollmentStrategy } from './email-enrollment.strategy';
import { SmsEnrollmentStrategy } from './sms-enrollment.strategy';
import { TotpEnrollmentStrategy } from './totp-enrollment.strategy';
import { EnrollTfaUseCase } from '../../usecases/authentication/enroll-tfa.usecase';
import type {
  TfaEnrollmentRequest,
  TfaEnrollmentStrategy,
} from './tfa-enrollment.strategy';

const USER_ID = 42;
const ACCOUNT_EMAIL = 'user@example.com';

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

const makeUserRepository = (email = ACCOUNT_EMAIL) => ({
  findById: jest.fn().mockResolvedValue(buildUser({ email })),
  findByEmail: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  findOneBySocialId: jest.fn(),
  findPreferences: jest.fn(),
  savePreferences: jest.fn(),
});

/** Requête d'enrôlement nominale — le canal est une donnée, pas une route. */
const request = (
  overrides: Partial<TfaEnrollmentRequest> = {},
): TfaEnrollmentRequest => ({
  method: TfaMethodType.EMAIL,
  userId: USER_ID,
  email: ACCOUNT_EMAIL,
  ...overrides,
});

describe('EnrollTfaUseCase — résolution du canal', () => {
  const stubStrategy = (method: TfaMethodType) => ({
    method,
    start: jest.fn().mockResolvedValue({ method }),
    confirm: jest.fn().mockResolvedValue(undefined),
  });

  it('délègue au canal demandé dans le body, sans connaître son implémentation', async () => {
    const totp = stubStrategy(TfaMethodType.TOTP);
    const email = stubStrategy(TfaMethodType.EMAIL);
    const usecase = new EnrollTfaUseCase([
      totp,
      email,
    ] as unknown as TfaEnrollmentStrategy[]);

    await usecase.start(request({ method: TfaMethodType.EMAIL }));

    expect(email.start).toHaveBeenCalledTimes(1);
    expect(totp.start).not.toHaveBeenCalled();
  });

  it('confirme via le canal indiqué dans la confirmation', async () => {
    const totp = stubStrategy(TfaMethodType.TOTP);
    const usecase = new EnrollTfaUseCase([
      totp,
    ] as unknown as TfaEnrollmentStrategy[]);

    await usecase.confirm({
      method: TfaMethodType.TOTP,
      userId: USER_ID,
      otp: '123456',
    });

    expect(totp.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ otp: '123456' }),
    );
  });

  it('rejette un canal sans stratégie enregistrée (appel interne hors DTO)', async () => {
    const usecase = new EnrollTfaUseCase([
      stubStrategy(TfaMethodType.TOTP),
    ] as unknown as TfaEnrollmentStrategy[]);

    await expect(
      usecase.start(request({ method: TfaMethodType.SMS })),
    ).rejects.toBeInstanceOf(UnsupportedTfaMethodError);
  });
});

describe('EmailEnrollmentStrategy', () => {
  const makeStrategy = (
    methods: ChannelTfaMethod[] = [],
    email = ACCOUNT_EMAIL,
  ) => {
    const otpStore = makeOtpStore();
    const methodRepository = makeChannelRepository(methods);
    const userRepository = makeUserRepository(email);
    const authMailer = {
      sendEmailVerificationLink: jest.fn().mockResolvedValue(undefined),
      sendLoginOtp: jest.fn().mockResolvedValue(undefined),
    };

    const strategy = new EmailEnrollmentStrategy(
      otpStore as unknown as OtpStore,
      methodRepository as unknown as ChannelTfaMethodRepository,
      userRepository as unknown as UserRepository,
      authMailer as unknown as AuthMailer,
    );

    return { strategy, otpStore, methodRepository, userRepository, authMailer };
  };

  it("envoie le code à l'adresse du compte, jamais à celle du body", async () => {
    // Accepter une adresse arbitraire laisserait déplacer le second facteur
    // vers une boîte tierce depuis une simple session valide.
    const { strategy, authMailer } = makeStrategy();

    const challenge = await strategy.start(
      request({ email: 'attacker@evil.test' }),
    );

    expect(authMailer.sendLoginOtp).toHaveBeenCalledWith(
      ACCOUNT_EMAIL,
      '123456',
    );
    expect(challenge).toEqual({
      method: TfaMethodType.EMAIL,
      sentTo: ACCOUNT_EMAIL,
    });
  });

  it("cloisonne l'OTP d'enrôlement des OTP de connexion", async () => {
    // Un code émis pour enrôler un canal ne doit pas pouvoir ouvrir une
    // session, ni l'inverse : les clés de store sont disjointes.
    const { strategy, otpStore } = makeStrategy();

    await strategy.start(request());

    expect(otpStore.generateOtp).toHaveBeenCalledWith(
      `otp:enroll:email:${USER_ID}`,
    );
  });

  it('purge les enrôlements abandonnés avant de créer la méthode en attente', async () => {
    const { strategy, methodRepository } = makeStrategy();

    await strategy.start(request());

    expect(methodRepository.deletePendingForUser).toHaveBeenCalledWith(USER_ID);
    expect(methodRepository.create).toHaveBeenCalledWith(
      USER_ID,
      ACCOUNT_EMAIL,
    );
    expect(
      methodRepository.deletePendingForUser.mock.invocationCallOrder[0],
    ).toBeLessThan(methodRepository.create.mock.invocationCallOrder[0]);
  });

  it('refuse de réenrôler un canal déjà actif sur la même destination', async () => {
    const { strategy, methodRepository } = makeStrategy([
      { id: 1, isActive: true, target: ACCOUNT_EMAIL },
    ]);

    await expect(strategy.start(request())).rejects.toBeInstanceOf(
      TfaMethodAlreadyEnrolledError,
    );
    expect(methodRepository.create).not.toHaveBeenCalled();
  });

  it("refuse d'émettre un second code tant que le précédent est valide", async () => {
    const { strategy, otpStore, methodRepository } = makeStrategy();
    otpStore.hasActiveOtp.mockResolvedValue(true);

    await expect(strategy.start(request())).rejects.toBeInstanceOf(
      OtpAlreadyActiveError,
    );
    expect(methodRepository.create).not.toHaveBeenCalled();
  });

  it("invalide l'OTP si la remise échoue, pour autoriser un retry immédiat", async () => {
    // Sans cette invalidation l'utilisateur resterait bloqué tout le TTL
    // sans jamais avoir reçu le code.
    const { strategy, otpStore, authMailer } = makeStrategy();
    authMailer.sendLoginOtp.mockRejectedValue(new Error('SMTP down'));

    await expect(strategy.start(request())).rejects.toBeInstanceOf(
      OtpDeliveryFailedError,
    );
    expect(otpStore.invalidate).toHaveBeenCalledWith(
      `otp:enroll:email:${USER_ID}`,
    );
  });

  it('rejette une confirmation sans enrôlement en cours', async () => {
    const { strategy, otpStore } = makeStrategy([
      { id: 1, isActive: true, target: ACCOUNT_EMAIL },
    ]);

    await expect(
      strategy.confirm({
        method: TfaMethodType.EMAIL,
        userId: USER_ID,
        otp: '123456',
      }),
    ).rejects.toBeInstanceOf(TfaEnrollmentNotStartedError);
    expect(otpStore.verifyOtp).not.toHaveBeenCalled();
  });

  it("n'active rien si le code de confirmation est faux", async () => {
    const { strategy, otpStore, methodRepository } = makeStrategy([
      { id: 7, isActive: false, target: ACCOUNT_EMAIL },
    ]);
    otpStore.verifyOtp.mockResolvedValue(false);

    await expect(
      strategy.confirm({
        method: TfaMethodType.EMAIL,
        userId: USER_ID,
        otp: '000000',
      }),
    ).rejects.toBeInstanceOf(InvalidOtpCodeError);
    expect(methodRepository.activate).not.toHaveBeenCalled();
    expect(methodRepository.deactivateAllForUser).not.toHaveBeenCalled();
  });

  it('fait de la méthode confirmée la seule méthode active du canal', async () => {
    const { strategy, methodRepository } = makeStrategy([
      { id: 7, isActive: false, target: ACCOUNT_EMAIL },
      { id: 3, isActive: true, target: 'ancienne@example.com' },
    ]);

    await strategy.confirm({
      method: TfaMethodType.EMAIL,
      userId: USER_ID,
      otp: '123456',
    });

    expect(methodRepository.activate).toHaveBeenCalledWith(7);
    expect(
      methodRepository.deactivateAllForUser.mock.invocationCallOrder[0],
    ).toBeLessThan(methodRepository.activate.mock.invocationCallOrder[0]);
  });
});

describe('SmsEnrollmentStrategy — destination', () => {
  const makeStrategy = (methods: ChannelTfaMethod[] = []) => {
    const otpStore = makeOtpStore();
    const methodRepository = makeChannelRepository(methods);
    const smsService = {
      sendOtp: jest.fn().mockResolvedValue(undefined),
      sendTransactional: jest.fn().mockResolvedValue(undefined),
    };

    const strategy = new SmsEnrollmentStrategy(
      otpStore as unknown as OtpStore,
      methodRepository as unknown as ChannelTfaMethodRepository,
      smsService as unknown as SmsService,
    );

    return { strategy, otpStore, methodRepository, smsService };
  };

  it('exige un numéro : le compte ne porte pas de téléphone', async () => {
    const { strategy } = makeStrategy();

    await expect(
      strategy.start(request({ method: TfaMethodType.SMS, phone: undefined })),
    ).rejects.toBeInstanceOf(MissingPhoneNumberError);
  });

  it('rejette un numéro hors format E.164', async () => {
    const { strategy } = makeStrategy();

    await expect(
      strategy.start(request({ method: TfaMethodType.SMS, phone: '0612345' })),
    ).rejects.toBeInstanceOf(InvalidPhoneNumberError);
  });

  it('normalise le numéro avant de le persister et de l’appeler', async () => {
    // Sans normalisation, « +33 6 12 34 56 78 » et « +33612345678 »
    // créeraient deux enrôlements distincts pour la même ligne.
    const { strategy, methodRepository, smsService } = makeStrategy();

    const challenge = await strategy.start(
      request({ method: TfaMethodType.SMS, phone: '+33 6 12 34 56 78' }),
    );

    expect(methodRepository.create).toHaveBeenCalledWith(
      USER_ID,
      '+33612345678',
    );
    expect(smsService.sendOtp).toHaveBeenCalledWith('+33612345678', '123456');
    expect(challenge.sentTo).toBe('+33612345678');
  });

  it("utilise une clé d'OTP propre au canal SMS", async () => {
    const { strategy, otpStore } = makeStrategy();

    await strategy.start(
      request({ method: TfaMethodType.SMS, phone: '+33612345678' }),
    );

    expect(otpStore.generateOtp).toHaveBeenCalledWith(
      `otp:enroll:sms:${USER_ID}`,
    );
  });
});

describe('TotpEnrollmentStrategy', () => {
  const makeStrategy = (methods: TotpMethod[] = []) => {
    const totpGenerator = {
      generateSecret: jest
        .fn()
        .mockReturnValue({ secret: 'PLAIN-SECRET', uri: 'otpauth://totp/x' }),
      verify: jest.fn().mockResolvedValue(false),
    };
    const totpMethodRepository = {
      create: jest.fn().mockResolvedValue(undefined),
      findAllByUserId: jest.fn().mockResolvedValue(methods),
      deletePendingForUser: jest.fn().mockResolvedValue(undefined),
      deactivateAllForUser: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn().mockResolvedValue(undefined),
    };
    const secretCipher = {
      encrypt: jest.fn((plaintext: string) => `enc(${plaintext})`),
      decrypt: jest.fn((ciphertext: string) =>
        ciphertext.replace(/^enc\(|\)$/g, ''),
      ),
    };
    const userRepository = makeUserRepository();

    const strategy = new TotpEnrollmentStrategy(
      totpGenerator as unknown as TotpGenerator,
      userRepository as unknown as UserRepository,
      totpMethodRepository as unknown as TotpMethodRepository,
      secretCipher as unknown as SecretCipher,
    );

    return {
      strategy,
      totpGenerator,
      totpMethodRepository,
      secretCipher,
      userRepository,
    };
  };

  const totpMethod = (overrides: Partial<TotpMethod> = {}): TotpMethod =>
    ({
      id: 1,
      isActive: false,
      encryptedSecret: 'enc(PLAIN-SECRET)',
      ...overrides,
    }) as TotpMethod;

  it('rend le secret en clair à scanner mais ne persiste que sa version chiffrée', async () => {
    const { strategy, totpMethodRepository, secretCipher } = makeStrategy();

    const challenge = await strategy.start(
      request({ method: TfaMethodType.TOTP }),
    );

    expect(challenge).toEqual({
      method: TfaMethodType.TOTP,
      secret: 'PLAIN-SECRET',
      uri: 'otpauth://totp/x',
    });
    expect(secretCipher.encrypt).toHaveBeenCalledWith('PLAIN-SECRET');
    expect(totpMethodRepository.create).toHaveBeenCalledWith(
      USER_ID,
      'enc(PLAIN-SECRET)',
    );
  });

  it('purge les secrets abandonnés avant de créer le nouveau', async () => {
    const { strategy, totpMethodRepository } = makeStrategy();

    await strategy.start(request({ method: TfaMethodType.TOTP }));

    expect(totpMethodRepository.deletePendingForUser).toHaveBeenCalledWith(
      USER_ID,
    );
    expect(
      totpMethodRepository.deletePendingForUser.mock.invocationCallOrder[0],
    ).toBeLessThan(totpMethodRepository.create.mock.invocationCallOrder[0]);
  });

  it('signale un compte sans méthode TOTP enrôlée', async () => {
    const { strategy } = makeStrategy([]);

    await expect(
      strategy.confirm({
        method: TfaMethodType.TOTP,
        userId: USER_ID,
        otp: '123456',
      }),
    ).rejects.toBeInstanceOf(TotpNotConfiguredError);
  });

  it('rejette un code qui ne valide aucun secret enrôlé', async () => {
    // Régression : `verify` rendait autrefois une Promise testée sans await,
    // donc toujours vraie — n'importe quel code à 6 chiffres passait.
    const { strategy, totpMethodRepository } = makeStrategy([totpMethod()]);

    await expect(
      strategy.confirm({
        method: TfaMethodType.TOTP,
        userId: USER_ID,
        otp: '000000',
      }),
    ).rejects.toBeInstanceOf(InvalidTotpCodeError);
    expect(totpMethodRepository.activate).not.toHaveBeenCalled();
  });

  it('active la méthode à sa première vérification réussie', async () => {
    const { strategy, totpGenerator, totpMethodRepository } = makeStrategy([
      totpMethod({ id: 9 }),
    ]);
    totpGenerator.verify.mockResolvedValue(true);

    await strategy.confirm({
      method: TfaMethodType.TOTP,
      userId: USER_ID,
      otp: '123456',
    });

    expect(totpGenerator.verify).toHaveBeenCalledWith('123456', 'PLAIN-SECRET');
    expect(totpMethodRepository.deactivateAllForUser).toHaveBeenCalledWith(
      USER_ID,
    );
    expect(totpMethodRepository.activate).toHaveBeenCalledWith(9);
  });

  it('ne réécrit rien quand la méthode validée est déjà active', async () => {
    const { strategy, totpGenerator, totpMethodRepository } = makeStrategy([
      totpMethod({ id: 9, isActive: true }),
    ]);
    totpGenerator.verify.mockResolvedValue(true);

    await strategy.confirm({
      method: TfaMethodType.TOTP,
      userId: USER_ID,
      otp: '123456',
    });

    expect(totpMethodRepository.deactivateAllForUser).not.toHaveBeenCalled();
    expect(totpMethodRepository.activate).not.toHaveBeenCalled();
  });
});
