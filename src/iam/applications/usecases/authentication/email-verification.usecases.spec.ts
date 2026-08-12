import {
  EmailVerificationTokenTypeError,
  InvalidEmailVerificationTokenError,
} from 'src/iam/domains/errors';
import { SendEmailVerificationUseCase } from './send-email-verification.usecase';
import { ConfirmEmailUseCase } from './confirm-email.usecase';
import type { CacheManagerService } from 'src/iam/domains/ports/cache-manager.port';
import type {
  EmailTokenPayload,
  TokenService,
} from 'src/iam/domains/ports/token.port';
import type { AuthMailer } from 'src/iam/domains/ports/auth-mailer.port';
import type { UserRepository } from 'src/iam/domains/ports/user.repository';
import { User } from 'src/iam/domains/models/user';
import { buildUser as buildUserFixture } from 'src/iam/domains/models/user.fixture';

const buildUser = (verified: boolean): User =>
  buildUserFixture({ emailVerified: verified });

const makeDeps = (user: User | null) => {
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
  const authMailer = {
    sendEmailVerificationLink: jest.fn().mockResolvedValue(undefined),
    sendLoginOtp: jest.fn().mockResolvedValue(undefined),
  };

  const sendUsecase = new SendEmailVerificationUseCase(
    tokenService as unknown as TokenService,
    usersRepository as unknown as UserRepository,
    cacheManagerService as unknown as CacheManagerService,
    authMailer as unknown as AuthMailer,
  );
  const confirmUsecase = new ConfirmEmailUseCase(
    tokenService as unknown as TokenService,
    usersRepository as unknown as UserRepository,
    cacheManagerService as unknown as CacheManagerService,
  );

  return {
    sendUsecase,
    confirmUsecase,
    tokenService,
    usersRepository,
    cacheManagerService,
    authMailer,
  };
};

describe('SendEmailVerificationUseCase — anti-enumeration', () => {
  it('ne lève pas si le compte est inconnu (retour générique)', async () => {
    const { sendUsecase, authMailer } = makeDeps(null);
    await expect(
      sendUsecase.execute('nobody@example.com'),
    ).resolves.toBeUndefined();
    expect(authMailer.sendEmailVerificationLink).not.toHaveBeenCalled();
  });

  it('ne lève pas si le compte est déjà vérifié (retour générique)', async () => {
    const { sendUsecase, authMailer } = makeDeps(buildUser(true));
    await expect(
      sendUsecase.execute('user@example.com'),
    ).resolves.toBeUndefined();
    expect(authMailer.sendEmailVerificationLink).not.toHaveBeenCalled();
  });

  it("envoie l'email avec un token de type email_verify pour un compte existant non vérifié", async () => {
    const { sendUsecase, tokenService, cacheManagerService, authMailer } =
      makeDeps(buildUser(false));
    tokenService.generateEmailToken.mockResolvedValue('signed-token');

    await sendUsecase.execute('user@example.com');

    expect(tokenService.generateEmailToken).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
      'email_verify',
    );
    expect(cacheManagerService.insertEmailTokenId).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      'email_verify',
    );
    expect(authMailer.sendEmailVerificationLink).toHaveBeenCalledWith(
      'user@example.com',
      'signed-token',
    );
  });
});

describe('ConfirmEmailUseCase — garde anti-confusion de token', () => {
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
    const { confirmUsecase, tokenService, cacheManagerService } = makeDeps(
      buildUser(false),
    );
    tokenService.verifyEmailToken.mockResolvedValue(
      buildPayload({ type: 'password_reset' }),
    );

    await expect(confirmUsecase.execute('some-token')).rejects.toBeInstanceOf(
      EmailVerificationTokenTypeError,
    );
    expect(cacheManagerService.validateEmailToken).not.toHaveBeenCalled();
  });

  it('rejette (401) un token émis avant le correctif (sans claim type)', async () => {
    const { confirmUsecase, tokenService } = makeDeps(buildUser(false));
    const legacyPayload = buildPayload();
    delete (legacyPayload as unknown as Record<string, unknown>).type;
    tokenService.verifyEmailToken.mockResolvedValue(legacyPayload);

    await expect(confirmUsecase.execute('some-token')).rejects.toBeInstanceOf(
      EmailVerificationTokenTypeError,
    );
  });

  it('rejette (400) le rejeu du même token après une première utilisation', async () => {
    const { confirmUsecase, tokenService, cacheManagerService } = makeDeps(
      buildUser(false),
    );
    tokenService.verifyEmailToken.mockResolvedValue(buildPayload());
    // Le tokenId ne correspond plus à celui stocké (déjà invalidé / rejoué).
    cacheManagerService.validateEmailToken.mockResolvedValue(false);

    await expect(confirmUsecase.execute('some-token')).rejects.toBeInstanceOf(
      InvalidEmailVerificationTokenError,
    );
    expect(cacheManagerService.invalidateEmailTokenId).not.toHaveBeenCalled();
  });

  it('valide, invalide en base Redis puis marque l’email vérifié pour un token email_verify valide et non rejoué', async () => {
    const user = buildUser(false);
    const {
      confirmUsecase,
      tokenService,
      cacheManagerService,
      usersRepository,
    } = makeDeps(user);
    tokenService.verifyEmailToken.mockResolvedValue(buildPayload());
    cacheManagerService.validateEmailToken.mockResolvedValue(true);

    const result = await confirmUsecase.execute('some-token');

    expect(cacheManagerService.invalidateEmailTokenId).toHaveBeenCalledWith(
      'user@example.com',
      'email_verify',
    );
    expect(usersRepository.update).toHaveBeenCalled();
    expect(user.isEmailVerified()).toBe(true);
    expect(result).toEqual({ email: 'user@example.com' });
  });
});
