import { UnauthorizedException } from '@nestjs/common';
import { SignInUsecase } from './sign-in.usecase';
import { User } from 'src/users/domains/user';
import { UserEmail } from 'src/users/domains/value-objects/user-email.vo';
import { UserStatus } from 'src/users/infrastructure/persistences/entities/user.entity';
import {
  ACCOUNT_CLOSED_CODE,
  ACCOUNT_SUSPENDED_CODE,
} from 'src/common/auth/account-status.guard';

// Nest's UnauthorizedException wraps a plain string message into
// { statusCode, message, error }; extracts just the message either way.
const genericMessageOf = (err: UnauthorizedException): unknown => {
  const response = err.getResponse();
  return typeof response === 'string'
    ? response
    : (response as Record<string, unknown>).message;
};

const buildUser = (status: UserStatus): User => {
  const user = new User();
  user.userId = 42;
  user.password = 'hashed-password';
  user.role = 'investisseur' as any;
  user.status = status;
  const userEmail = new UserEmail('user@example.com');
  userEmail.verify();
  user.userEmail = userEmail;
  return user;
};

const makeUsecase = (user: User | null, passwordValid = true) => {
  const hashingService = {
    hash: jest.fn(),
    compare: jest.fn().mockResolvedValue(passwordValid),
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
  const usersRepository = {
    findByEmail: jest.fn().mockResolvedValue(user),
    save: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn(),
  };
  const usecase = new SignInUsecase(
    hashingService as any,
    tokenService as any,
    usersRepository as any,
  );
  return { usecase, hashingService, tokenService, usersRepository };
};

describe('SignInUsecase', () => {
  it('connecte un compte actif', async () => {
    const { usecase, tokenService } = makeUsecase(buildUser(UserStatus.ACTIF));
    await expect(
      usecase.signIn({ email: 'user@example.com', password: 'pw' }),
    ).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(tokenService.generateTokens).toHaveBeenCalled();
  });

  it('refuse (401 + code ACCOUNT_SUSPENDED) un compte suspendu, sans générer de token', async () => {
    const { usecase, tokenService } = makeUsecase(buildUser(UserStatus.SUSPENDU));
    let caught: UnauthorizedException | undefined;
    try {
      await usecase.signIn({ email: 'user@example.com', password: 'pw' });
    } catch (e) {
      caught = e as UnauthorizedException;
    }
    expect(caught).toBeInstanceOf(UnauthorizedException);
    const body = caught!.getResponse() as Record<string, unknown>;
    expect(body).toMatchObject({ code: ACCOUNT_SUSPENDED_CODE });
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it.each([UserStatus.CLOS, UserStatus.SUPPRIME])(
    'refuse (401 + code ACCOUNT_CLOSED) le statut %s, sans générer de token',
    async (status) => {
      const { usecase, tokenService } = makeUsecase(buildUser(status));
      let caught: UnauthorizedException | undefined;
      try {
        await usecase.signIn({ email: 'user@example.com', password: 'pw' });
      } catch (e) {
        caught = e as UnauthorizedException;
      }
      expect(caught).toBeInstanceOf(UnauthorizedException);
      const body = caught!.getResponse() as Record<string, unknown>;
      expect(body).toMatchObject({ code: ACCOUNT_CLOSED_CODE });
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    },
  );

  it('refuse un email non vérifié, après vérification du mot de passe, avant même de regarder le statut', async () => {
    const user = buildUser(UserStatus.SUSPENDU);
    user.userEmail = new UserEmail('user@example.com'); // isVerified: false
    const { usecase, hashingService } = makeUsecase(user);
    let caught: UnauthorizedException | undefined;
    try {
      await usecase.signIn({ email: 'user@example.com', password: 'pw' });
    } catch (e) {
      caught = e as UnauthorizedException;
    }
    const body = caught!.getResponse() as Record<string, unknown>;
    expect(body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    // Le mot de passe a bien été vérifié avant que le code EMAIL_NOT_VERIFIED
    // ne soit renvoyé (anti-enumeration : ce code ne doit jamais fuiter sans
    // preuve de connaissance du mot de passe).
    expect(hashingService.compare).toHaveBeenCalled();
  });

  it('refuse un email inconnu', async () => {
    const { usecase } = makeUsecase(null);
    await expect(
      usecase.signIn({ email: 'nobody@example.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('anti-enumeration : le mot de passe est vérifié avant tout code de statut informatif', () => {
    it('renvoie le message générique (pas EMAIL_NOT_VERIFIED) si le mot de passe est incorrect sur un compte non vérifié', async () => {
      const user = buildUser(UserStatus.ACTIF);
      user.userEmail = new UserEmail('user@example.com'); // isVerified: false
      const { usecase, tokenService } = makeUsecase(user, false);
      let caught: UnauthorizedException | undefined;
      try {
        await usecase.signIn({ email: 'user@example.com', password: 'wrong' });
      } catch (e) {
        caught = e as UnauthorizedException;
      }
      expect(caught).toBeInstanceOf(UnauthorizedException);
      expect(genericMessageOf(caught!)).toBe(
        'Adresse email ou mot de passe incorrect',
      );
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('renvoie le message générique (pas ACCOUNT_SUSPENDED) si le mot de passe est incorrect sur un compte suspendu', async () => {
      const user = buildUser(UserStatus.SUSPENDU);
      const { usecase, tokenService } = makeUsecase(user, false);
      let caught: UnauthorizedException | undefined;
      try {
        await usecase.signIn({ email: 'user@example.com', password: 'wrong' });
      } catch (e) {
        caught = e as UnauthorizedException;
      }
      expect(caught).toBeInstanceOf(UnauthorizedException);
      expect(genericMessageOf(caught!)).toBe(
        'Adresse email ou mot de passe incorrect',
      );
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    });

    it.each([UserStatus.CLOS, UserStatus.SUPPRIME])(
      'renvoie le message générique (pas ACCOUNT_CLOSED) si le mot de passe est incorrect sur un compte %s',
      async (status) => {
        const user = buildUser(status);
        const { usecase, tokenService } = makeUsecase(user, false);
        let caught: UnauthorizedException | undefined;
        try {
          await usecase.signIn({ email: 'user@example.com', password: 'wrong' });
        } catch (e) {
          caught = e as UnauthorizedException;
        }
        expect(caught).toBeInstanceOf(UnauthorizedException);
        expect(genericMessageOf(caught!)).toBe(
          'Adresse email ou mot de passe incorrect',
        );
        expect(tokenService.generateTokens).not.toHaveBeenCalled();
      },
    );
  });
});
