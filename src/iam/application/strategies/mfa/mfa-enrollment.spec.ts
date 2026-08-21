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
} from 'src/iam/domain/errors';
import { MfaMethodType } from 'src/iam/domain/enums/mfa-method.enum';
import {
  MfaMethod,
  type MfaMethodSnapshot,
} from 'src/iam/domain/entities/mfa-method';

import { AuthMailerService } from 'src/iam/application/services/auth-mailer.service';
import { OtpService } from 'src/iam/application/services/otp/otp.service';
import type { SecretCipher } from 'src/iam/application/ports/secret-cipher.port';
import type { TotpGenerator } from 'src/iam/application/ports/totp-generator.port';
import type { TotpSecretService } from 'src/iam/application/services/totp/totp-secret.service';
import type { ConfigService } from '@nestjs/config';

import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import type { SmsService } from 'src/shared/sms/sms.service';
import { buildUser } from 'src/iam/domain/aggregates/user.fixture';
import { EmailEnrollmentStrategy } from '../email/email-enrollment.strategy';
import { SmsEnrollmentStrategy } from '../sms/sms-enrollment.strategy';
import { TotpEnrollmentStrategy } from '../totp/totp-enrollment.strategy';
import { EnrollMfaUseCase } from '../../usecases/mfa/enroll-mfa.usecase';
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

/**
 * Un seul port, celui du compte : les facteurs sont ses entites, et c'est en
 * sauvegardant le compte qu'on les enregistre. Les assertions portent donc sur
 * l'agregat capture dans `update`, et non plus sur les appels d'un repository
 * de facteurs qui n'existe plus.
 */
const makeUserRepository = (
  methods: MfaMethod[] = [],
  email = ACCOUNT_EMAIL,
) => {
  const compte = buildUser({ email, facteurs: methods });
  return {
    compte,
    findById: jest.fn().mockResolvedValue(compte),
    findByIdWithFacteurs: jest.fn().mockResolvedValue(compte),
    findByEmail: jest.fn(),
    save: jest.fn(),
    update: jest.fn((u: unknown) => Promise.resolve(u)),
    findOneBySocialId: jest.fn(),
  };
};

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
    const userRepository = makeUserRepository(methods, email);
    const authMailer = {
      sendEmailVerificationLink: jest.fn().mockResolvedValue(undefined),
      sendLoginOtp: jest.fn().mockResolvedValue(undefined),
    };

    const strategy = new EmailEnrollmentStrategy(
      otpService as unknown as OtpService,
      userRepository as unknown as UserRepository,
      authMailer as unknown as AuthMailerService,
    );

    return { strategy, otpService, userRepository, authMailer };
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
    // Un seul enrolement en attente par canal : la purge et la creation sont
    // desormais la meme operation sur l'agregat, donc indissociables.
    const abandonne = MfaMethod.rehydrate({
      id: 3,
      isActive: false,
      method: MfaMethodType.EMAIL,
      credential: ACCOUNT_EMAIL,
    });
    const { strategy, userRepository } = makeStrategy([abandonne]);

    await strategy.start(request());

    const enAttente = userRepository.compte.facteurEnAttente(
      MfaMethodType.EMAIL,
    );
    expect(enAttente).not.toBeNull();
    // Le nouveau, pas l'ancien : celui-ci n'a pas encore d'identifiant.
    expect(enAttente?.id).toBeNull();
    expect(userRepository.compte.facteurs).toHaveLength(1);
    expect(userRepository.update).toHaveBeenCalledWith(userRepository.compte);
  });

  it('refuse de réenrôler un canal déjà actif sur la même destination', async () => {
    const { strategy, userRepository } = makeStrategy([
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
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('réémet un code même si le précédent est encore valide', async () => {
    const { strategy, otpService, userRepository } = makeStrategy();
    otpService.hasActiveOtp.mockResolvedValue(true);

    // Rappeler `start` est le moyen de redemander un code quand le premier
    // n'est pas arrivé : refuser laissait l'utilisateur bloqué tout le TTL.
    await expect(strategy.start(request())).resolves.toMatchObject({
      method: MfaMethodType.EMAIL,
    });
    expect(otpService.generateOtp).toHaveBeenCalled();
    expect(userRepository.update).toHaveBeenCalled();
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
    const { strategy, otpService, userRepository } = makeStrategy([
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
    expect(userRepository.compte.facteurActif()).toBeNull();
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('désarme les facteurs des AUTRES canaux en activant celui-ci', async () => {
    // L'invariant du contexte : au plus un facteur actif par compte, tous
    // canaux confondus. La désactivation ne doit donc pas être bornée au canal
    // qu'on enrôle — sinon un compte protégé par TOTP qui enrôle l'email
    // garderait les deux armés, et le plus faible resterait un chemin d'entrée
    // ouvert à son insu.
    const { strategy, userRepository } = makeStrategy([
      MfaMethod.rehydrate({
        id: 7,
        isActive: false,
        method: MfaMethodType.EMAIL,
        credential: ACCOUNT_EMAIL,
      }),
      MfaMethod.rehydrate({
        id: 9,
        isActive: true,
        method: MfaMethodType.TOTP,
        credential: 'secret-chiffre',
      }),
    ]);

    await strategy.confirm({
      method: MfaMethodType.EMAIL,
      userId: USER_ID,
      otp: '123456',
    });

    // Le TOTP qui protegeait le compte est desarme : l'invariant est tenu par
    // l'agregat, et non plus par un `deactivateAll` que chaque appelant devait
    // penser a lancer avant d'activer.
    expect(userRepository.compte.facteursActifsDe(MfaMethodType.TOTP)).toEqual(
      [],
    );
    expect(userRepository.compte.facteurActif()?.method).toBe(
      MfaMethodType.EMAIL,
    );
  });

  it('fait de la méthode confirmée la seule méthode active du canal', async () => {
    const { strategy, userRepository } = makeStrategy([
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

    const actifs = userRepository.compte.facteursActifsDe(MfaMethodType.EMAIL);
    expect(actifs).toHaveLength(1);
    expect(actifs[0].id).toBe(7);
  });
});

describe('SmsEnrollmentStrategy — destination', () => {
  const makeStrategy = (methods: MfaMethod[] = []) => {
    const otpService = makeOtpStore();
    const userRepository = makeUserRepository(methods);
    const smsService = {
      sendOtp: jest.fn().mockResolvedValue(undefined),
      sendTransactional: jest.fn().mockResolvedValue(undefined),
    };

    const strategy = new SmsEnrollmentStrategy(
      otpService as unknown as OtpService,
      userRepository as unknown as UserRepository,
      smsService as unknown as SmsService,
    );

    return { strategy, otpService, userRepository, smsService };
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
    const { strategy, userRepository, smsService } = makeStrategy();

    const challenge = await strategy.start(
      request({ method: MfaMethodType.SMS, phone: '+33 6 12 34 56 78' }),
    );

    // Le facteur enrôlé porte le numéro normalisé : c'est le compte qui le
    // garde, et c'est lui qu'on sauvegarde.
    const enrole = userRepository.compte.facteurEnAttente(MfaMethodType.SMS);
    expect(enrole?.destination).toBe('+33612345678');
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
    const secretCipher = {
      encrypt: jest.fn((plaintext: string) => `enc(${plaintext})`),
      decrypt: jest.fn((ciphertext: string) =>
        ciphertext.replace(/^enc\(|\)$/g, ''),
      ),
    };
    const userRepository = makeUserRepository(methods);
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
      secretCipher as unknown as SecretCipher,
      authMailer as unknown as AuthMailerService,
      configService as unknown as ConfigService,
    );

    return {
      strategy,
      totpSecrets,
      totpGenerator,
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
      const { strategy, authMailer, configService, userRepository } =
        makeStrategy();
      configService.get.mockImplementation(env({ TOTP_QR_EMAIL: 'true' }));
      authMailer.sendTotpQrCode.mockRejectedValue(new Error('SMTP down'));

      // Le secret est déjà en base et la réponse HTTP porte l'URI : un envoi
      // raté ne doit pas défaire un enrôlement réussi.
      await expect(
        strategy.start(request({ method: MfaMethodType.TOTP })),
      ).resolves.toMatchObject({ secret: 'PLAIN-SECRET' });
      expect(userRepository.update).toHaveBeenCalled();
    });
  });

  it('rend le secret en clair à scanner mais ne persiste que sa version chiffrée', async () => {
    const { strategy, userRepository, secretCipher } = makeStrategy();

    const challenge = await strategy.start(
      request({ method: MfaMethodType.TOTP }),
    );

    expect(challenge).toEqual({
      method: MfaMethodType.TOTP,
      secret: 'PLAIN-SECRET',
      uri: 'otpauth://totp/x',
    });
    expect(secretCipher.encrypt).toHaveBeenCalledWith('PLAIN-SECRET');
    // Le compte porte le secret chiffré, jamais le clair.
    expect(
      userRepository.compte.facteurEnAttente(MfaMethodType.TOTP)
        ?.encryptedSecret,
    ).toBe('enc(PLAIN-SECRET)');
  });

  it('purge les secrets abandonnés avant de créer le nouveau', async () => {
    // Un QR code affiché puis abandonné ne doit pas rester enrôlable : le
    // nouvel enrôlement remplace l'ancien au lieu de s'y ajouter.
    const { strategy, userRepository } = makeStrategy([totpMethod({ id: 4 })]);

    await strategy.start(request({ method: MfaMethodType.TOTP }));

    expect(userRepository.compte.facteurs).toHaveLength(1);
    expect(
      userRepository.compte.facteurEnAttente(MfaMethodType.TOTP)?.id,
    ).toBeNull();
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
    const { strategy, userRepository } = makeStrategy([totpMethod()]);

    await expect(
      strategy.confirm({
        method: MfaMethodType.TOTP,
        userId: USER_ID,
        otp: '000000',
      }),
    ).rejects.toBeInstanceOf(InvalidTotpCodeError);
    expect(userRepository.compte.facteurActif()).toBeNull();
  });

  it('active la méthode à sa première vérification réussie', async () => {
    const { strategy, totpGenerator, userRepository } = makeStrategy([
      totpMethod({ id: 9 }),
    ]);
    totpGenerator.verify.mockResolvedValue(true);

    await strategy.confirm({
      method: MfaMethodType.TOTP,
      userId: USER_ID,
      otp: '123456',
    });

    expect(totpGenerator.verify).toHaveBeenCalledWith('123456', 'PLAIN-SECRET');
    expect(userRepository.compte.facteurActif()?.id).toBe(9);
    expect(userRepository.update).toHaveBeenCalled();
  });

  it('ne réécrit rien quand la méthode validée est déjà active', async () => {
    const { strategy, totpGenerator, userRepository } = makeStrategy([
      totpMethod({ id: 9, isActive: true }),
    ]);
    totpGenerator.verify.mockResolvedValue(true);

    await strategy.confirm({
      method: MfaMethodType.TOTP,
      userId: USER_ID,
      otp: '123456',
    });

    expect(userRepository.update).not.toHaveBeenCalled();
  });
});
