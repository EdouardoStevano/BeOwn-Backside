import { Test } from '@nestjs/testing';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { TOKEN_SERVICE } from 'src/iam/domains/ports/token.service';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { USER_REPOSITORY } from 'src/users/applications/ports/repositories/user.repository';
import { UserFactory } from 'src/users/domains/factories/user.factory';

import { RefreshTokenHandler } from './refresh-token.handler';
import { RefreshTokenCommand } from './refresh-token.command';
import { SocialAuthHandler } from './social-auth.handler';
import { SocialAuthCommand } from './social-auth.command';
import { ForgotPasswordHandler } from './forgot-password.handler';
import { ForgotPasswordCommand } from './forgot-password.command';
import { ResetPasswordHandler } from './reset-password.handler';
import { ResetPasswordCommand } from './reset-password.command';

describe('authentication commands via CommandBus', () => {
  let commandBus: CommandBus;

  const userRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findOneBySocialId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const tokenService = {
    generateTokens: jest.fn(),
    refreshTokens: jest.fn(),
    generateEmailToken: jest.fn(),
    verifyEmailToken: jest.fn(),
  };
  const hashingService = { hash: jest.fn(), compare: jest.fn() };
  const emailService = { sendPasswordResetEmail: jest.fn() };
  const userFactory = { create: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        RefreshTokenHandler,
        SocialAuthHandler,
        ForgotPasswordHandler,
        ResetPasswordHandler,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        { provide: HASHING_SERVICE, useValue: hashingService },
        { provide: EMAIL_SERVICE, useValue: emailService },
        { provide: UserFactory, useValue: userFactory },
      ],
    }).compile();
    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
  });

  describe('RefreshTokenCommand', () => {
    it('returns rotated tokens', async () => {
      tokenService.refreshTokens.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
      });
      await expect(
        commandBus.execute(new RefreshTokenCommand('old-rt')),
      ).resolves.toEqual({ accessToken: 'at', refreshToken: 'rt' });
      expect(tokenService.refreshTokens).toHaveBeenCalledWith('old-rt');
    });

    it('maps any failure to 401', async () => {
      tokenService.refreshTokens.mockRejectedValue(new Error('expired'));
      await expect(
        commandBus.execute(new RefreshTokenCommand('bad')),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('SocialAuthCommand', () => {
    const social = {
      email: 'a@b.com',
      firstname: 'Jean',
      socialId: 'goog-1',
    };

    it('signs in an existing social user and verifies their email', async () => {
      const verify = jest.fn();
      userRepository.findOneBySocialId.mockResolvedValue({
        userId: 1,
        role: 'USER',
        userEmail: { email: 'a@b.com', isVerified: false, verify },
      });
      tokenService.generateTokens.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
      });

      const result = await commandBus.execute(new SocialAuthCommand(social));

      expect(verify).toHaveBeenCalled();
      expect(userRepository.update).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'at',
        refreshToken: 'rt',
        isNewUser: false,
      });
    });

    it('creates a new user when the social id is unknown', async () => {
      userRepository.findOneBySocialId.mockResolvedValue(null);
      userFactory.create.mockResolvedValue({ id: 'new' });
      userRepository.save.mockResolvedValue({
        userId: 2,
        role: 'USER',
        userEmail: { email: 'a@b.com', isVerified: true },
      });
      tokenService.generateTokens.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
      });

      const result = await commandBus.execute(new SocialAuthCommand(social));

      expect(result.isNewUser).toBe(true);
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('maps a unique-violation to 409', async () => {
      userRepository.findOneBySocialId.mockRejectedValue({ code: '23505' });
      await expect(
        commandBus.execute(new SocialAuthCommand(social)),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('ForgotPasswordCommand', () => {
    it('sends a reset email to a known user', async () => {
      userRepository.findByEmail.mockResolvedValue({
        userId: 5,
        userEmail: { email: 'a@b.com' },
      });
      tokenService.generateEmailToken.mockResolvedValue('email-token');

      await commandBus.execute(new ForgotPasswordCommand('a@b.com'));

      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'a@b.com',
        'email-token',
      );
    });

    it('no-ops for an unknown email (no user enumeration)', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(
        commandBus.execute(new ForgotPasswordCommand('ghost@b.com')),
      ).resolves.toBeUndefined();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('surfaces a 500 when the email provider fails', async () => {
      userRepository.findByEmail.mockResolvedValue({
        userId: 5,
        userEmail: { email: 'a@b.com' },
      });
      tokenService.generateEmailToken.mockResolvedValue('email-token');
      emailService.sendPasswordResetEmail.mockRejectedValue(new Error('brevo'));

      await expect(
        commandBus.execute(new ForgotPasswordCommand('a@b.com')),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('ResetPasswordCommand', () => {
    it('hashes and persists the new password', async () => {
      tokenService.verifyEmailToken.mockResolvedValue({ sub: 9 });
      const user = { userId: 9, password: 'old' };
      userRepository.findById.mockResolvedValue(user);
      hashingService.hash.mockResolvedValue('hashed-new');

      await commandBus.execute(new ResetPasswordCommand('tok', 'NewPass123'));

      expect(hashingService.hash).toHaveBeenCalledWith('NewPass123');
      expect(user.password).toBe('hashed-new');
      expect(userRepository.update).toHaveBeenCalledWith(user);
    });

    it('rejects an invalid token', async () => {
      tokenService.verifyEmailToken.mockRejectedValue(new Error('bad'));
      await expect(
        commandBus.execute(new ResetPasswordCommand('bad', 'NewPass123')),
      ).rejects.toThrow('Token invalide ou expiré');
    });

    it('rejects a token pointing at a missing user', async () => {
      tokenService.verifyEmailToken.mockResolvedValue({ sub: 404 });
      userRepository.findById.mockResolvedValue(null);
      await expect(
        commandBus.execute(new ResetPasswordCommand('tok', 'NewPass123')),
      ).rejects.toThrow('Utilisateur non trouvé');
    });
  });
});
