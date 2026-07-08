import { UnauthorizedException } from '@nestjs/common';
import { ResetPasswordUseCase } from './reset-password.usecase';
import { User } from 'src/users/domains/user';
import { UserEmail } from 'src/users/domains/value-objects/user-email.vo';
import type { EmailTokenPayload } from 'src/iam/domains/ports/token.service';

const buildUser = (): User => {
  const user = new User();
  user.userId = 42;
  user.password = 'old-hash';
  user.userEmail = new UserEmail('user@example.com');
  return user;
};

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

  const usecase = new ResetPasswordUseCase(
    userRepository as any,
    tokenService as any,
    hashingService as any,
    cacheManagerService as any,
  );

  return { usecase, tokenService, hashingService, userRepository, cacheManagerService };
};

describe('ResetPasswordUseCase', () => {
  it('réinitialise le mot de passe pour un token password_reset valide et non rejoué', async () => {
    const { usecase, tokenService, cacheManagerService, userRepository } =
      makeUsecase();
    tokenService.verifyEmailToken.mockResolvedValue(buildPayload());
    cacheManagerService.validateEmailToken.mockResolvedValue(true);
    userRepository.findById.mockResolvedValue(buildUser());

    await usecase.execute({ token: 'valid-token', newPassword: 'NewPass123' });

    expect(cacheManagerService.validateEmailToken).toHaveBeenCalledWith(
      'user@example.com',
      'token-id',
      'password_reset',
    );
    expect(cacheManagerService.invalidateEmailTokenId).toHaveBeenCalledWith(
      'user@example.com',
      'password_reset',
    );
    expect(userRepository.update).toHaveBeenCalled();
  });

  it('rejette (401) un token de type email_verify — bug de confusion de token', async () => {
    const { usecase, tokenService, cacheManagerService } = makeUsecase();
    tokenService.verifyEmailToken.mockResolvedValue(
      buildPayload({ type: 'email_verify' }),
    );

    await expect(
      usecase.execute({ token: 'verify-token', newPassword: 'NewPass123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // Un token du mauvais type est rejeté avant même de toucher le store
    // Redis de single-use.
    expect(cacheManagerService.validateEmailToken).not.toHaveBeenCalled();
  });

  it('rejette (401) un token émis avant le correctif (sans claim type)', async () => {
    const { usecase, tokenService } = makeUsecase();
    const legacyPayload = buildPayload();
    delete (legacyPayload as Record<string, unknown>).type;
    tokenService.verifyEmailToken.mockResolvedValue(legacyPayload);

    await expect(
      usecase.execute({ token: 'legacy-token', newPassword: 'NewPass123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette (401) le rejeu du même lien de réinitialisation après une première utilisation', async () => {
    const { usecase, tokenService, cacheManagerService, userRepository } =
      makeUsecase();
    tokenService.verifyEmailToken.mockResolvedValue(buildPayload());
    // Premier appel : tokenId encore valide en Redis.
    cacheManagerService.validateEmailToken.mockResolvedValueOnce(true);
    userRepository.findById.mockResolvedValue(buildUser());

    await usecase.execute({ token: 'valid-token', newPassword: 'NewPass123' });

    // Deuxième appel avec le même token : invalidateEmailTokenId a déjà
    // supprimé l'entrée Redis, donc la validation échoue désormais.
    cacheManagerService.validateEmailToken.mockResolvedValueOnce(false);

    await expect(
      usecase.execute({ token: 'valid-token', newPassword: 'AnotherPass123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette (401) un JWT invalide ou expiré', async () => {
    const { usecase, tokenService } = makeUsecase();
    tokenService.verifyEmailToken.mockRejectedValue(new Error('jwt expired'));

    await expect(
      usecase.execute({ token: 'bad-token', newPassword: 'NewPass123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
