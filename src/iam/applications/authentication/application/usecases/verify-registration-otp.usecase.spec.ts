import { UnauthorizedException } from '@nestjs/common';
import { VerifyRegistrationOtpUseCase } from './verify-registration-otp.usecase';
import { RegistrationOtpVerifyResult } from './registration-otp.service';
import { User } from 'src/users/domains/user';
import { UserEmail } from 'src/users/domains/value-objects/user-email.vo';
import { UserStatus } from 'src/users/infrastructure/persistences/entities/user.entity';

const buildUser = (status: UserStatus = UserStatus.CREE): User => {
  const user = new User();
  user.userId = 42;
  user.role = 'investisseur' as any;
  user.status = status;
  user.userEmail = new UserEmail('user@example.com'); // isVerified: false
  return user;
};

const makeUsecase = (user: User | null = buildUser()) => {
  const userRepository = {
    findByEmail: jest.fn().mockResolvedValue(user),
    findById: jest.fn(),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn(),
  };
  const tokenService = {
    generateTokens: jest.fn().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    }),
    refreshTokens: jest.fn(),
    verifyAccessToken: jest.fn(),
    generateEmailToken: jest.fn(),
    verifyEmailToken: jest.fn(),
  };
  const registrationOtpService = {
    generate: jest.fn(),
    verify: jest.fn(),
    invalidate: jest.fn(),
    isResendThrottled: jest.fn(),
  };

  const usecase = new VerifyRegistrationOtpUseCase(
    userRepository as any,
    tokenService as any,
    registrationOtpService as any,
  );

  return { usecase, userRepository, tokenService, registrationOtpService, user };
};

describe('VerifyRegistrationOtpUseCase', () => {
  it('code valide : passe CREE -> EMAIL_VERIFIE, vérifie l’email et retourne les tokens de session', async () => {
    const { usecase, userRepository, tokenService, registrationOtpService, user } =
      makeUsecase();
    registrationOtpService.verify.mockResolvedValue(
      RegistrationOtpVerifyResult.OK,
    );

    const tokens = await usecase.execute({
      email: 'user@example.com',
      code: '123456',
    });

    expect(tokens).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(user!.userEmail.isVerified).toBe(true);
    expect(user!.status).toBe(UserStatus.EMAIL_VERIFIE);
    expect(userRepository.update).toHaveBeenCalledWith(user);
    expect(tokenService.generateTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 42,
        email: 'user@example.com',
        role: 'investisseur',
      }),
    );
  });

  it('ne rétrograde pas un statut déjà avancé (ex: ACTIF) mais vérifie tout de même l’email', async () => {
    const { usecase, registrationOtpService, user } = makeUsecase(
      buildUser(UserStatus.ACTIF),
    );
    registrationOtpService.verify.mockResolvedValue(
      RegistrationOtpVerifyResult.OK,
    );

    await usecase.execute({ email: 'user@example.com', code: '123456' });

    expect(user!.status).toBe(UserStatus.ACTIF);
    expect(user!.userEmail.isVerified).toBe(true);
  });

  it('code invalide : 401 sans tokens ni changement de statut', async () => {
    const { usecase, tokenService, userRepository, registrationOtpService, user } =
      makeUsecase();
    registrationOtpService.verify.mockResolvedValue(
      RegistrationOtpVerifyResult.INVALID,
    );

    await expect(
      usecase.execute({ email: 'user@example.com', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
    expect(user!.userEmail.isVerified).toBe(false);
  });

  it('code expiré : 401', async () => {
    const { usecase, registrationOtpService } = makeUsecase();
    registrationOtpService.verify.mockResolvedValue(
      RegistrationOtpVerifyResult.EXPIRED,
    );

    await expect(
      usecase.execute({ email: 'user@example.com', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('trop de tentatives : 401 avec message dédié', async () => {
    const { usecase, registrationOtpService } = makeUsecase();
    registrationOtpService.verify.mockResolvedValue(
      RegistrationOtpVerifyResult.TOO_MANY_ATTEMPTS,
    );

    let caught: UnauthorizedException | undefined;
    try {
      await usecase.execute({ email: 'user@example.com', code: '123456' });
    } catch (e) {
      caught = e as UnauthorizedException;
    }
    expect(caught).toBeInstanceOf(UnauthorizedException);
    expect(String(caught!.message)).toContain('Trop de tentatives');
  });

  it('email inconnu : 401 générique, sans jamais appeler la vérification du code (non-énumérant)', async () => {
    const { usecase, registrationOtpService } = makeUsecase(null);

    await expect(
      usecase.execute({ email: 'nobody@example.com', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(registrationOtpService.verify).not.toHaveBeenCalled();
  });
});
