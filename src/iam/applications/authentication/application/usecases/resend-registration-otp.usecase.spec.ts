import { BadRequestException } from '@nestjs/common';
import { ResendRegistrationOtpUseCase } from './resend-registration-otp.usecase';
import { User } from 'src/users/domains/user';
import { UserEmail } from 'src/users/domains/value-objects/user-email.vo';
import { UserStatus } from 'src/users/infrastructure/persistences/entities/user.entity';

const buildUser = (opts: { verified?: boolean } = {}): User => {
  const user = new User();
  user.userId = 42;
  user.role = 'investisseur' as any;
  user.status = UserStatus.CREE;
  const email = new UserEmail('user@example.com');
  if (opts.verified) email.verify();
  user.userEmail = email;
  return user;
};

const makeUsecase = (user: User | null = buildUser()) => {
  const userRepository = {
    findByEmail: jest.fn().mockResolvedValue(user),
    findById: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn(),
  };
  const profilRepository = {
    findProfilPPByUserId: jest.fn().mockResolvedValue(null),
    saveProfilPP: jest.fn(),
    updateProfilPP: jest.fn(),
    saveProfilPM: jest.fn(),
    findProfilPMByUserId: jest.fn(),
    saveKyc: jest.fn(),
    findKycByUserId: jest.fn(),
    findAllKyc: jest.fn(),
    updateKycStatus: jest.fn(),
    updateKycSession: jest.fn(),
    updateKycReportData: jest.fn(),
  };
  const registrationOtpService = {
    generate: jest.fn(),
    verify: jest.fn(),
    invalidate: jest.fn(),
    isResendThrottled: jest.fn().mockResolvedValue(false),
  };
  const sendRegistrationOtpUseCase = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  const usecase = new ResendRegistrationOtpUseCase(
    userRepository as any,
    profilRepository as any,
    registrationOtpService as any,
    sendRegistrationOtpUseCase as any,
  );

  return {
    usecase,
    userRepository,
    profilRepository,
    registrationOtpService,
    sendRegistrationOtpUseCase,
    user,
  };
};

describe('ResendRegistrationOtpUseCase (non-énumérant)', () => {
  it('renvoie un code email et résout (204) pour un compte existant non vérifié', async () => {
    const { usecase, sendRegistrationOtpUseCase, user } = makeUsecase();

    await expect(
      usecase.execute({ email: 'user@example.com' }),
    ).resolves.toBeUndefined();
    expect(sendRegistrationOtpUseCase.send).toHaveBeenCalledWith(
      user,
      'email',
      undefined,
    );
  });

  it('email inconnu : résout sans erreur et n’envoie rien', async () => {
    const { usecase, sendRegistrationOtpUseCase } = makeUsecase(null);

    await expect(
      usecase.execute({ email: 'nobody@example.com' }),
    ).resolves.toBeUndefined();
    expect(sendRegistrationOtpUseCase.send).not.toHaveBeenCalled();
  });

  it('compte déjà vérifié : résout sans envoyer', async () => {
    const { usecase, sendRegistrationOtpUseCase } = makeUsecase(
      buildUser({ verified: true }),
    );

    await expect(
      usecase.execute({ email: 'user@example.com' }),
    ).resolves.toBeUndefined();
    expect(sendRegistrationOtpUseCase.send).not.toHaveBeenCalled();
  });

  it('renvoi throttlé (1/min) : résout sans envoyer', async () => {
    const { usecase, registrationOtpService, sendRegistrationOtpUseCase } =
      makeUsecase();
    registrationOtpService.isResendThrottled.mockResolvedValue(true);

    await expect(
      usecase.execute({ email: 'user@example.com' }),
    ).resolves.toBeUndefined();
    expect(sendRegistrationOtpUseCase.send).not.toHaveBeenCalled();
  });

  it('canal sms avec téléphone présent : envoie via sms', async () => {
    const { usecase, profilRepository, sendRegistrationOtpUseCase, user } =
      makeUsecase();
    profilRepository.findProfilPPByUserId.mockResolvedValue({
      telephone: '+33612345678',
    });

    await usecase.execute({ email: 'user@example.com', canal: 'sms' });

    expect(sendRegistrationOtpUseCase.send).toHaveBeenCalledWith(
      user,
      'sms',
      '+33612345678',
    );
  });

  it('canal sms sans téléphone : 400', async () => {
    const { usecase, profilRepository, sendRegistrationOtpUseCase } =
      makeUsecase();
    profilRepository.findProfilPPByUserId.mockResolvedValue({ telephone: null });

    await expect(
      usecase.execute({ email: 'user@example.com', canal: 'sms' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendRegistrationOtpUseCase.send).not.toHaveBeenCalled();
  });

  it('échec de livraison : résout tout de même (contrat 204), erreur avalée', async () => {
    const { usecase, sendRegistrationOtpUseCase } = makeUsecase();
    sendRegistrationOtpUseCase.send.mockRejectedValue(new Error('mail down'));

    await expect(
      usecase.execute({ email: 'user@example.com' }),
    ).resolves.toBeUndefined();
  });
});
