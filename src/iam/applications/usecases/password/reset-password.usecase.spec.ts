import { InvalidPasswordResetTokenError } from 'src/iam/domains/errors';
import { ResetPasswordUseCase } from './reset-password.usecase';
import { buildUser } from 'src/iam/domains/models/user.fixture';
import type { EmailTokenPayload } from 'src/iam/applications/models/auth-token';

const buildPayload = (
  overrides: Partial<EmailTokenPayload> = {},
): EmailTokenPayload => ({
  sub: 42,
  email: 'user@example.com',
  emailTokenId: 'token-id',
  type: 'password_reset',
  ...overrides,
});

const makeUsecase = () => {
  const tokenService = {
    verifyEmailToken: jest.fn(),
    generateEmailToken: jest.fn(),
    generateTokens: jest.fn(),
    refreshTokens: jest.fn(),
    verifyAccessToken: jest.fn(),
  };
  const hashingService = {
    hash: jest.fn().mockResolvedValue('new-hash'),
    compare: jest.fn(),
  };
  const userRepository = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn(),
  };
  const emailTokenCache = {
    validateEmailToken: jest.fn(),
    insertEmailTokenId: jest.fn(),
    invalidateEmailTokenId: jest.fn(),
  };
  const sessionCache = {
    insertRefreshTokenId: jest.fn(),
    validateRefreshToken: jest.fn(),
    invalidateRefreshTokenId: jest.fn(),
  };

  const usecase = new ResetPasswordUseCase(
    userRepository as any,
    tokenService as any,
    hashingService as any,
    emailTokenCache as any,
    sessionCache as any,
  );

  return {
    usecase,
    tokenService,
    hashingService,
    userRepository,
    emailTokenCache,
    sessionCache,
  };
};

describe('ResetPasswordUseCase', () => {
  it('réinitialise le mot de passe pour un token password_reset valide et non rejoué', async () => {
    const { usecase, tokenService, emailTokenCache, userRepository } =
      makeUsecase();
    tokenService.verifyEmailToken.mockResolvedValue(buildPayload());
    emailTokenCache.validateEmailToken.mockResolvedValue(true);
    userRepository.findById.mockResolvedValue(buildUser());

    await usecase.execute({ token: 'valid-token', newPassword: 'NewPass123' });

    expect(emailTokenCache.validateEmailToken).toHaveBeenCalledWith(
      'user@example.com',
      'token-id',
      'password_reset',
    );
    expect(emailTokenCache.invalidateEmailTokenId).toHaveBeenCalledWith(
      'user@example.com',
      'password_reset',
    );
    expect(userRepository.update).toHaveBeenCalled();
  });

  it('rejette (401) un token de type email_verify — bug de confusion de token', async () => {
    const { usecase, tokenService, emailTokenCache } = makeUsecase();
    tokenService.verifyEmailToken.mockResolvedValue(
      buildPayload({ type: 'email_verify' }),
    );

    await expect(
      usecase.execute({ token: 'verify-token', newPassword: 'NewPass123' }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
    // Un token du mauvais type est rejeté avant même de toucher le store
    // Redis de single-use.
    expect(emailTokenCache.validateEmailToken).not.toHaveBeenCalled();
  });

  it('rejette (401) un token émis avant le correctif (sans claim type)', async () => {
    const { usecase, tokenService } = makeUsecase();
    const legacyPayload = buildPayload();
    delete (legacyPayload as unknown as Record<string, unknown>).type;
    tokenService.verifyEmailToken.mockResolvedValue(legacyPayload);

    await expect(
      usecase.execute({ token: 'legacy-token', newPassword: 'NewPass123' }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it('rejette (401) le rejeu du même lien de réinitialisation après une première utilisation', async () => {
    const { usecase, tokenService, emailTokenCache, userRepository } =
      makeUsecase();
    tokenService.verifyEmailToken.mockResolvedValue(buildPayload());
    // Premier appel : tokenId encore valide en Redis.
    emailTokenCache.validateEmailToken.mockResolvedValueOnce(true);
    userRepository.findById.mockResolvedValue(buildUser());

    await usecase.execute({ token: 'valid-token', newPassword: 'NewPass123' });

    // Deuxième appel avec le même token : invalidateEmailTokenId a déjà
    // supprimé l'entrée Redis, donc la validation échoue désormais.
    emailTokenCache.validateEmailToken.mockResolvedValueOnce(false);

    await expect(
      usecase.execute({ token: 'valid-token', newPassword: 'AnotherPass123' }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it('rejette (401) un JWT invalide ou expiré', async () => {
    const { usecase, tokenService } = makeUsecase();
    tokenService.verifyEmailToken.mockRejectedValue(new Error('jwt expired'));

    await expect(
      usecase.execute({ token: 'bad-token', newPassword: 'NewPass123' }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });
});
