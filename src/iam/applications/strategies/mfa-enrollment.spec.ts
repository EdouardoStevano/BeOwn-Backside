import {
  InvalidOtpCodeError,
  InvalidPhoneNumberError,
  InvalidTotpCodeError,
  MissingPhoneNumberError,
  OtpDeliveryFailedError,
  MfaEnrollmentNotStartedError,
  MfaMethodAlreadyEnrolledError,
  TotpNotConfiguredError,
  UnsupportedMfaMethodError,
} from 'src/iam/domains/errors';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import {
  MfaMethod,
  type MfaMethodSnapshot,
} from 'src/iam/domains/models/mfa-method';

import { AuthMailerService } from 'src/iam/applications/services/auth-mailer.service';
import type { MfaMethodRepository } from 'src/iam/domains/ports/mfa-method.repository';
import { OtpService } from 'src/iam/applications/services/otp.service';
import type { SecretCipher } from 'src/iam/applications/ports/secret-cipher.port';
import type { TotpGenerator } from 'src/iam/applications/ports/totp-generator.port';
import type { TotpSecretService } from 'src/iam/applications/services/totp-secret.service';
import type { ConfigService } from '@nestjs/config';

import type { UserRepository } from 'src/iam/domains/ports/user.repository';
import type { SmsService } from 'src/shared/sms/sms.service';
import { buildUser } from 'src/iam/domains/models/user.fixture';
import { EmailEnrollmentStrategy } from './email-enrollment.strategy';
import { SmsEnrollmentStrategy } from './sms-enrollment.strategy';
import { TotpEnrollmentStrategy } from './totp-enrollment.strategy';
import { EnrollMfaUseCase } from '../usecases/enroll-mfa.usecase';
import type {
  MfaEnrollmentRequest,
  MfaEnrollmentStrategy,
} from './mfa-enrollment.strategy';

const USER_ID = 42;
const ACCOUNT_EMAIL = 'user@example.com';

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
  overrides: Partial<MfaEnrollmentRequest> = {},
): MfaEnrollmentRequest => ({
  method: MfaMethodType.EMAIL,
  userId: USER_ID,
  email: ACCOUNT_EMAIL,
  ...overrides,
});

describe('EnrollMfaUseCase — résolution du canal', () => {
  const stubStrategy = (method: MfaMethodType) => ({
    method,
    start: jest.fn().mockResolvedValue({ method }),
    confirm: jest.fn().mockResolvedValue(undefined),
  });

  it('délègue au canal demandé dans le body, sans connaître son implémentation', async () => {
    const totp = stubStrategy(MfaMethodType.TOTP);
    const email = stubStrategy(MfaMethodType.EMAIL);
    const usecase = new EnrollMfaUseCase([
      totp,
      email,
    ] as unknown as MfaEnrollmentStrategy[]);

    await usecase.start(request({ method: MfaMethodType.EMAIL }));

    expect(email.start).toHaveBeenCalledTimes(1);
    expect(totp.start).not.toHaveBeenCalled();
  });

  it('confirme via le canal indiqué dans la confirmation', async () => {
    const totp = stubStrategy(MfaMethodType.TOTP);
    const usecase = new EnrollMfaUseCase([
      totp,
    ] as unknown as MfaEnrollmentStrategy[]);

    await usecase.confirm({
      method: MfaMethodType.TOTP,
      userId: USER_ID,
      otp: '123456',
    });

    expect(totp.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ otp: '123456' }),
    );
  });

  it('rejette un canal sans stratégie enregistrée (appel interne hors DTO)', async () => {
    const usecase = new EnrollMfaUseCase([
      stubStrategy(MfaMethodType.TOTP),
    ] as unknown as MfaEnrollmentStrategy[]);

    await expect(
      usecase.start(request({ method: MfaMethodType.SMS })),
    ).rejects.toBeInstanceOf(UnsupportedMfaMethodError);
  });
});

describe('EmailEnrollmentStrategy', () => {
  const makeStrategy = (methods: MfaMethod[] = [], email = ACCOUNT_EMAIL) => {
    const otpService = makeOtpStore();
    const methodRepository = makeChannelRepository(methods);
    const userRepository = makeUserRepository(email);
    const authMailer = {
      sendEmailVerificationLink: jest.fn().mockResolvedValue(undefined),
      sendLoginOtp: jest.fn().mockResolvedValue(undefined),
    };

    const strategy = new EmailEnrollmentStrategy(
      otpService as unknown as OtpService,
      methodRepository as unknown as MfaMethodRepository,
      userRepository as unknown as UserRepository,
      authMailer as unknown as AuthMailerService,
    );

    return {
      strategy,
      otpService,
      methodRepository,
      userRepository,
      authMailer,
    };
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
      method: MfaMethodType.EMAIL,
      sentTo: ACCOUNT_EMAIL,
    });
  });

  it("cloisonne l'OTP d'enrôlement des OTP de connexion", async () => {
    // Un code émis pour enrôler un canal ne doit pas pouvoir ouvrir une
    // session, ni l'inverse : les clés de store sont disjointes.
    const { strategy, otpService } = makeStrategy();

    await strategy.start(request());

    expect(otpService.generateOtp).toHaveBeenCalledWith(
      `otp:enroll:email:${USER_ID}`,
    );
  });

  it('purge les enrôlements abandonnés avant de créer la méthode en attente', async () => {
    const { strategy, methodRepository } = makeStrategy();

    await strategy.start(request());

    expect(methodRepository.deletePendingForUser).toHaveBeenCalledWith(
      USER_ID,
      MfaMethodType.EMAIL,
    );
    expect(methodRepository.create).toHaveBeenCalledWith(
      USER_ID,
      MfaMethodType.EMAIL,
      ACCOUNT_EMAIL,
    );
    expect(
      methodRepository.deletePendingForUser.mock.invocationCallOrder[0],
    ).toBeLessThan(methodRepository.create.mock.invocationCallOrder[0]);
  });

  it('refuse de réenrôler un canal déjà actif sur la même destination', async () => {
    const { strategy, methodRepository } = makeStrategy([
      MfaMethod.rehydrate({
        id: 1,
        isActive: true,
        method: MfaMethodType.EMAIL,
        credential: ACCOUNT_EMAIL,
      }),
    ]);

    await expect(strategy.start(request())).rejects.toBeInstanceOf(
      MfaMethodAlreadyEnrolledError,
    );
    expect(methodRepository.create).not.toHaveBeenCalled();
  });

  it('réémet un code même si le précédent est encore valide', async () => {
    const { strategy, otpService, methodRepository } = makeStrategy();
    otpService.hasActiveOtp.mockResolvedValue(true);

    // Rappeler `start` est le moyen de redemander un code quand le premier
    // n'est pas arrivé : refuser laissait l'utilisateur bloqué tout le TTL.
    await expect(strategy.start(request())).resolves.toMatchObject({
      method: MfaMethodType.EMAIL,
    });
    expect(otpService.generateOtp).toHaveBeenCalled();
    expect(methodRepository.create).toHaveBeenCalled();
  });

  it("invalide l'OTP si la remise échoue, pour autoriser un retry immédiat", async () => {
    // Sans cette invalidation l'utilisateur resterait bloqué tout le TTL
    // sans jamais avoir reçu le code.
    const { strategy, otpService, authMailer } = makeStrategy();
    authMailer.sendLoginOtp.mockRejectedValue(new Error('SMTP down'));

    await expect(strategy.start(request())).rejects.toBeInstanceOf(
      OtpDeliveryFailedError,
    );
    expect(otpService.invalidate).toHaveBeenCalledWith(
      `otp:enroll:email:${USER_ID}`,
    );
  });

  it('rejette une confirmation sans enrôlement en cours', async () => {
    const { strategy, otpService } = makeStrategy([
      MfaMethod.rehydrate({
        id: 1,
        isActive: true,
        method: MfaMethodType.EMAIL,
        credential: ACCOUNT_EMAIL,
      }),
    ]);

    await expect(
      strategy.confirm({
        method: MfaMethodType.EMAIL,
        userId: USER_ID,
        otp: '123456',
      }),
    ).rejects.toBeInstanceOf(MfaEnrollmentNotStartedError);
    expect(otpService.verifyOtp).not.toHaveBeenCalled();
  });

  it("n'active rien si le code de confirmation est faux", async () => {
    const { strategy, otpService, methodRepository } = makeStrategy([
      MfaMethod.rehydrate({
        id: 7,
        isActive: false,
        method: MfaMethodType.EMAIL,
        credential: ACCOUNT_EMAIL,
      }),
    ]);
    otpService.verifyOtp.mockResolvedValue(false);

    await expect(
      strategy.confirm({
        method: MfaMethodType.EMAIL,
        userId: USER_ID,
        otp: '000000',
      }),
    ).rejects.toBeInstanceOf(InvalidOtpCodeError);
    expect(methodRepository.activate).not.toHaveBeenCalled();
    expect(methodRepository.deactivateAll).not.toHaveBeenCalled();
  });

  it('désarme les facteurs des AUTRES canaux en activant celui-ci', async () => {
    // L'invariant du contexte : au plus un facteur actif par compte, tous
    // canaux confondus. La désactivation ne doit donc pas être bornée au canal
    // qu'on enrôle — sinon un compte protégé par TOTP qui enrôle l'email
    // garderait les deux armés, et le plus faible resterait un chemin d'entrée
    // ouvert à son insu.
    const { strategy, methodRepository } = makeStrategy([
      MfaMethod.rehydrate({
        id: 7,
        isActive: false,
        method: MfaMethodType.EMAIL,
        credential: ACCOUNT_EMAIL,
      }),
    ]);

    await strategy.confirm({
      method: MfaMethodType.EMAIL,
      userId: USER_ID,
      otp: '123456',
    });

    expect(methodRepository.deactivateAll).toHaveBeenCalledWith(USER_ID);
    // Et surtout : pas de désactivation bornée au canal, qui laisserait
    // survivre le facteur d'un autre canal.
    expect(methodRepository.deactivateChannel).not.toHaveBeenCalled();
  });

  it('fait de la méthode confirmée la seule méthode active du canal', async () => {
    const { strategy, methodRepository } = makeStrategy([
      MfaMethod.rehydrate({
        id: 7,
        isActive: false,
        method: MfaMethodType.EMAIL,
        credential: ACCOUNT_EMAIL,
      }),
      MfaMethod.rehydrate({
        id: 3,
        isActive: true,
        method: MfaMethodType.EMAIL,
        credential: 'ancienne@example.com',
      }),
    ]);

    await strategy.confirm({
      method: MfaMethodType.EMAIL,
      userId: USER_ID,
      otp: '123456',
    });

    expect(methodRepository.activate).toHaveBeenCalledWith(7);
    expect(
      methodRepository.deactivateAll.mock.invocationCallOrder[0],
    ).toBeLessThan(methodRepository.activate.mock.invocationCallOrder[0]);
  });
});

describe('SmsEnrollmentStrategy — destination', () => {
  const makeStrategy = (methods: MfaMethod[] = []) => {
    const otpService = makeOtpStore();
    const methodRepository = makeChannelRepository(methods);
    const smsService = {
      sendOtp: jest.fn().mockResolvedValue(undefined),
      sendTransactional: jest.fn().mockResolvedValue(undefined),
    };

    const strategy = new SmsEnrollmentStrategy(
      otpService as unknown as OtpService,
      methodRepository as unknown as MfaMethodRepository,
      smsService as unknown as SmsService,
    );

    return { strategy, otpService, methodRepository, smsService };
  };

  it('exige un numéro : le compte ne porte pas de téléphone', async () => {
    const { strategy } = makeStrategy();

    await expect(
      strategy.start(request({ method: MfaMethodType.SMS, phone: undefined })),
    ).rejects.toBeInstanceOf(MissingPhoneNumberError);
  });

  it('rejette un numéro hors format E.164', async () => {
    const { strategy } = makeStrategy();

    await expect(
      strategy.start(request({ method: MfaMethodType.SMS, phone: '0612345' })),
    ).rejects.toBeInstanceOf(InvalidPhoneNumberError);
  });

  it('normalise le numéro avant de le persister et de l’appeler', async () => {
    // Sans normalisation, « +33 6 12 34 56 78 » et « +33612345678 »
    // créeraient deux enrôlements distincts pour la même ligne.
    const { strategy, methodRepository, smsService } = makeStrategy();

    const challenge = await strategy.start(
      request({ method: MfaMethodType.SMS, phone: '+33 6 12 34 56 78' }),
    );

    expect(methodRepository.create).toHaveBeenCalledWith(
      USER_ID,
      MfaMethodType.SMS,
      '+33612345678',
    );
    expect(smsService.sendOtp).toHaveBeenCalledWith('+33612345678', '123456');
    expect(challenge.sentTo).toBe('+33612345678');
  });

  it("utilise une clé d'OTP propre au canal SMS", async () => {
    const { strategy, otpService } = makeStrategy();

    await strategy.start(
      request({ method: MfaMethodType.SMS, phone: '+33612345678' }),
    );

    expect(otpService.generateOtp).toHaveBeenCalledWith(
      `otp:enroll:sms:${USER_ID}`,
    );
  });
});

describe('TotpEnrollmentStrategy', () => {
  const makeStrategy = (methods: MfaMethod[] = []) => {
    // Le service compose le secret enrôlable (nom d'émetteur, URI) ; le port
    // ne fait plus que le calcul RFC 6238.
    const totpSecrets = {
      create: jest
        .fn()
        .mockReturnValue({ secret: 'PLAIN-SECRET', uri: 'otpauth://totp/x' }),
    };
    const totpGenerator = {
      generateSecret: jest.fn().mockReturnValue('PLAIN-SECRET'),
      buildUri: jest.fn().mockReturnValue('otpauth://totp/x'),
      verify: jest.fn().mockResolvedValue(false),
    };
    const totpMethodRepository = {
      create: jest.fn().mockResolvedValue(undefined),
      findAllByUserId: jest.fn().mockResolvedValue(methods),
      deletePendingForUser: jest.fn().mockResolvedValue(undefined),
      deactivateChannel: jest.fn().mockResolvedValue(undefined),
      deactivateAll: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn().mockResolvedValue(undefined),
    };
    const secretCipher = {
      encrypt: jest.fn((plaintext: string) => `enc(${plaintext})`),
      decrypt: jest.fn((ciphertext: string) =>
        ciphertext.replace(/^enc\(|\)$/g, ''),
      ),
    };
    const userRepository = makeUserRepository();
    const authMailer = {
      sendTotpQrCode: jest.fn().mockResolvedValue(undefined),
    };
    // `TOTP_QR_EMAIL` absent : l'envoi du QR code reste éteint par défaut,
    // c'est le comportement attendu partout sauf sur un poste de dev qui
    // l'aura demandé.
    const configService = { get: jest.fn().mockReturnValue(undefined) };

    const strategy = new TotpEnrollmentStrategy(
      totpSecrets as unknown as TotpSecretService,
      totpGenerator as unknown as TotpGenerator,
      userRepository as unknown as UserRepository,
      totpMethodRepository as unknown as MfaMethodRepository,
      secretCipher as unknown as SecretCipher,
      authMailer as unknown as AuthMailerService,
      configService as unknown as ConfigService,
    );

    return {
      strategy,
      totpSecrets,
      totpGenerator,
      totpMethodRepository,
      secretCipher,
      authMailer,
      configService,
      userRepository,
    };
  };

  const totpMethod = (overrides: Partial<MfaMethodSnapshot> = {}): MfaMethod =>
    MfaMethod.rehydrate({
      id: 1,
      isActive: false,
      method: MfaMethodType.TOTP,
      credential: 'enc(PLAIN-SECRET)',
      ...overrides,
    });

  describe('QR code par email (aide au développement)', () => {
    /** Simule un `.env` : `undefined` pour toute clé non renseignée. */
    const env = (values: Record<string, string>) => (key: string) =>
      values[key];

    it('n’envoie rien tant que TOTP_QR_EMAIL n’est pas demandé', async () => {
      const { strategy, authMailer } = makeStrategy();

      await strategy.start(request({ method: MfaMethodType.TOTP }));

      // Le message transporte le secret en clair : éteint par défaut, y
      // compris sur les environnements hors production.
      expect(authMailer.sendTotpQrCode).not.toHaveBeenCalled();
    });

    it('envoie le QR code quand TOTP_QR_EMAIL vaut true', async () => {
      const { strategy, authMailer, configService } = makeStrategy();
      configService.get.mockImplementation(env({ TOTP_QR_EMAIL: 'true' }));

      await strategy.start(request({ method: MfaMethodType.TOTP }));

      expect(authMailer.sendTotpQrCode).toHaveBeenCalledWith(
        ACCOUNT_EMAIL,
        'otpauth://totp/x',
        'PLAIN-SECRET',
      );
    });

    it('refuse en production, même si TOTP_QR_EMAIL est demandé', async () => {
      const { strategy, authMailer, configService } = makeStrategy();
      configService.get.mockImplementation(
        env({ TOTP_QR_EMAIL: 'true', NODE_ENV: 'production' }),
      );

      await strategy.start(request({ method: MfaMethodType.TOTP }));

      expect(authMailer.sendTotpQrCode).not.toHaveBeenCalled();
    });

    it('conserve l’enrôlement quand l’envoi échoue', async () => {
      const { strategy, authMailer, configService, totpMethodRepository } =
        makeStrategy();
      configService.get.mockImplementation(env({ TOTP_QR_EMAIL: 'true' }));
      authMailer.sendTotpQrCode.mockRejectedValue(new Error('SMTP down'));

      // Le secret est déjà en base et la réponse HTTP porte l'URI : un envoi
      // raté ne doit pas défaire un enrôlement réussi.
      await expect(
        strategy.start(request({ method: MfaMethodType.TOTP })),
      ).resolves.toMatchObject({ secret: 'PLAIN-SECRET' });
      expect(totpMethodRepository.create).toHaveBeenCalled();
    });
  });

  it('rend le secret en clair à scanner mais ne persiste que sa version chiffrée', async () => {
    const { strategy, totpMethodRepository, secretCipher } = makeStrategy();

    const challenge = await strategy.start(
      request({ method: MfaMethodType.TOTP }),
    );

    expect(challenge).toEqual({
      method: MfaMethodType.TOTP,
      secret: 'PLAIN-SECRET',
      uri: 'otpauth://totp/x',
    });
    expect(secretCipher.encrypt).toHaveBeenCalledWith('PLAIN-SECRET');
    expect(totpMethodRepository.create).toHaveBeenCalledWith(
      USER_ID,
      MfaMethodType.TOTP,
      'enc(PLAIN-SECRET)',
    );
  });

  it('purge les secrets abandonnés avant de créer le nouveau', async () => {
    const { strategy, totpMethodRepository } = makeStrategy();

    await strategy.start(request({ method: MfaMethodType.TOTP }));

    expect(totpMethodRepository.deletePendingForUser).toHaveBeenCalledWith(
      USER_ID,
      MfaMethodType.TOTP,
    );
    expect(
      totpMethodRepository.deletePendingForUser.mock.invocationCallOrder[0],
    ).toBeLessThan(totpMethodRepository.create.mock.invocationCallOrder[0]);
  });

  it('signale un compte sans méthode TOTP enrôlée', async () => {
    const { strategy } = makeStrategy([]);

    await expect(
      strategy.confirm({
        method: MfaMethodType.TOTP,
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
        method: MfaMethodType.TOTP,
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
      method: MfaMethodType.TOTP,
      userId: USER_ID,
      otp: '123456',
    });

    expect(totpGenerator.verify).toHaveBeenCalledWith('123456', 'PLAIN-SECRET');
    expect(totpMethodRepository.deactivateAll).toHaveBeenCalledWith(USER_ID);
    expect(totpMethodRepository.activate).toHaveBeenCalledWith(9);
  });

  it('ne réécrit rien quand la méthode validée est déjà active', async () => {
    const { strategy, totpGenerator, totpMethodRepository } = makeStrategy([
      totpMethod({ id: 9, isActive: true }),
    ]);
    totpGenerator.verify.mockResolvedValue(true);

    await strategy.confirm({
      method: MfaMethodType.TOTP,
      userId: USER_ID,
      otp: '123456',
    });

    expect(totpMethodRepository.deactivateAll).not.toHaveBeenCalled();
    expect(totpMethodRepository.activate).not.toHaveBeenCalled();
  });
});
