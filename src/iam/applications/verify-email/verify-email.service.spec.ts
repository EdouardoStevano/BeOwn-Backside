import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { VerifyEmailService } from './verify-email.service';
import type { CacheManagerService } from '../../domains/ports/cahe-manager.service';
import type {
  EmailTokenPayload,
  TokenService,
} from '../../domains/ports/token.service';
import type { UserRepository } from 'src/users/applications/ports/repositories/user.repository';
import { User } from 'src/users/domains/user';
import { UserEmail } from 'src/users/domains/value-objects/user-email.vo';

const buildUser = (verified: boolean): User => {
  const user = new User();
  user.userId = 42;
  const userEmail = new UserEmail('user@example.com');
  if (verified) userEmail.verify();
  user.userEmail = userEmail;
  return user;
};

const makeService = (user: User | null) => {
  const tokenService = {
    generateEmailToken: jest.fn(),
    verifyEmailToken: jest.fn(),
    generateTokens: jest.fn(),
    refreshTokens: jest.fn(),
    verifyAccessToken: jest.fn(),
  };
  const usersRepository = {
    findByEmail: jest.fn().mockResolvedValue(user),
    save: jest.fn(),
    findById: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn(),
  };
  const cacheManagerService = {
    insert: jest.fn(),
    get: jest.fn(),
    remove: jest.fn(),
    validateEmailToken: jest.fn(),
    validateRefreshToken: jest.fn(),
    insertRefreshTokenId: jest.fn(),
    invalidateRefreshTokenId: jest.fn(),
    insertEmailTokenId: jest.fn(),
    invalidateEmailTokenId: jest.fn(),
    insertOAuthCode: jest.fn(),
    getAndDeleteOAuthCode: jest.fn(),
  };
  const mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) };

  const service = new VerifyEmailService(
    tokenService as unknown as TokenService,
    usersRepository as unknown as UserRepository,
    cacheManagerService as unknown as CacheManagerService,
    mailerService as unknown as MailerService,
  );

  return { service, tokenService, usersRepository, cacheManagerService, mailerService };
};

describe('VerifyEmailService', () => {
  it('should be defined', () => {
    const { service } = makeService(null);
    expect(service).toBeDefined();
  });

  describe('sendVerificationEmail — anti-enumeration', () => {
    it('ne lève pas si le compte est inconnu (retour générique)', async () => {
      const { service, mailerService } = makeService(null);
      await expect(
        service.sendVerificationEmail({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();
      expect(mailerService.sendMail).not.toHaveBeenCalled();
    });

    it('ne lève pas si le compte est déjà vérifié (retour générique)', async () => {
      const { service, mailerService } = makeService(buildUser(true));
      await expect(
        service.sendVerificationEmail({ email: 'user@example.com' }),
      ).resolves.toBeUndefined();
      expect(mailerService.sendMail).not.toHaveBeenCalled();
    });

    it("envoie l'email avec un token de type email_verify pour un compte existant non vérifié", async () => {
      const { service, tokenService, cacheManagerService, mailerService } =
        makeService(buildUser(false));
      tokenService.generateEmailToken.mockResolvedValue('signed-token');

      await service.sendVerificationEmail({ email: 'user@example.com' });

      expect(tokenService.generateEmailToken).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com' }),
        'email_verify',
      );
      expect(cacheManagerService.insertEmailTokenId).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
        'email_verify',
      );
      expect(mailerService.sendMail).toHaveBeenCalled();
    });
  });

  describe('confirmEmail — garde anti-confusion de token', () => {
    const buildPayload = (
      overrides: Partial<EmailTokenPayload> = {},
    ): EmailTokenPayload => ({
      sub: 42,
      email: 'user@example.com',
      emailTokenId: 'token-id',
      type: 'email_verify',
      ...overrides,
    });

    it('rejette (401) un token de type password_reset', async () => {
      const { service, tokenService, cacheManagerService } = makeService(
        buildUser(false),
      );
      tokenService.verifyEmailToken.mockResolvedValue(
        buildPayload({ type: 'password_reset' }),
      );

      await expect(service.confirmEmail('some-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(cacheManagerService.validateEmailToken).not.toHaveBeenCalled();
    });

    it('rejette (401) un token émis avant le correctif (sans claim type)', async () => {
      const { service, tokenService } = makeService(buildUser(false));
      const legacyPayload = buildPayload();
      delete (legacyPayload as Record<string, unknown>).type;
      tokenService.verifyEmailToken.mockResolvedValue(legacyPayload);

      await expect(service.confirmEmail('some-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejette (400) le rejeu du même token après une première utilisation', async () => {
      const { service, tokenService, cacheManagerService } = makeService(
        buildUser(false),
      );
      tokenService.verifyEmailToken.mockResolvedValue(buildPayload());
      // Le tokenId ne correspond plus à celui stocké (déjà invalidé / rejoué).
      cacheManagerService.validateEmailToken.mockResolvedValue(false);

      await expect(service.confirmEmail('some-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(cacheManagerService.invalidateEmailTokenId).not.toHaveBeenCalled();
    });

    it('valide, invalide en base Redis puis marque l’email vérifié pour un token email_verify valide et non rejoué', async () => {
      const user = buildUser(false);
      const { service, tokenService, cacheManagerService, usersRepository } =
        makeService(user);
      tokenService.verifyEmailToken.mockResolvedValue(buildPayload());
      cacheManagerService.validateEmailToken.mockResolvedValue(true);

      const html = await service.confirmEmail('some-token');

      expect(cacheManagerService.invalidateEmailTokenId).toHaveBeenCalledWith(
        'user@example.com',
        'email_verify',
      );
      expect(usersRepository.update).toHaveBeenCalled();
      expect(user.userEmail.isVerified).toBe(true);
      expect(html).toContain('Email vérifié avec succès');
    });
  });
});
