import { RefreshTokenUseCase } from './refresh-token.usecase';
import { InvalidRefreshTokenError } from 'src/iam/domains/errors';
import { User } from 'src/iam/domains/models/user';
import { buildUser as buildUserFixture } from 'src/iam/domains/models/user.fixture';
import { UserStatus } from 'src/iam/domains/enums/user.enum';

const makeUsecase = (user: User | null = buildUserFixture()) => {
  const tokenService = {
    refreshTokens: jest.fn().mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    }),
    verifyAccessToken: jest
      .fn()
      .mockResolvedValue({ sub: 42, email: 'user@example.com' }),
    generateTokens: jest.fn(),
    generateEmailToken: jest.fn(),
    verifyEmailToken: jest.fn(),
    generateUnsubscribeToken: jest.fn(),
    verifyUnsubscribeToken: jest.fn(),
  };
  const userRepository = {
    findById: jest.fn().mockResolvedValue(user),
    findByIdWithPassword: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn(),
  };

  const usecase = new RefreshTokenUseCase(
    tokenService as any,
    userRepository as any,
  );

  return { usecase, tokenService, userRepository, user };
};

describe('RefreshTokenUseCase', () => {
  it('renouvelle les tokens et renvoie le compte (même forme que sign-in)', async () => {
    const { usecase, userRepository } = makeUsecase(
      buildUserFixture({ status: UserStatus.ACTIF, emailVerified: true }),
    );

    const session = await usecase.execute('old-refresh');

    expect(session).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    expect(session.user).toMatchObject({
      userId: 42,
      status: UserStatus.ACTIF,
    });
    // Le compte est relu à partir du `sub` du token fraîchement émis.
    expect(userRepository.findById).toHaveBeenCalledWith(42);
    // Aucune empreinte de mot de passe ne transite dans la réponse.
    expect(JSON.stringify(session)).not.toMatch(/password/i);
  });

  it('reflète l’état à jour du compte, pas celui figé dans l’ancien token', async () => {
    const { usecase } = makeUsecase(
      buildUserFixture({ status: UserStatus.SUSPENDU }),
    );

    const session = await usecase.execute('old-refresh');

    expect(session.user.status).toBe(UserStatus.SUSPENDU);
  });

  it('refresh token invalide ou révoqué : 401, sans lecture en base', async () => {
    const { usecase, tokenService, userRepository } = makeUsecase();
    tokenService.refreshTokens.mockRejectedValue(new Error('revoked'));

    await expect(usecase.execute('old-refresh')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('compte supprimé depuis l’émission du token : 401', async () => {
    const { usecase } = makeUsecase(null);

    await expect(usecase.execute('old-refresh')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('une panne de base ne se déguise pas en token invalide', async () => {
    const { usecase, userRepository } = makeUsecase();
    userRepository.findById.mockRejectedValue(new Error('db down'));

    await expect(usecase.execute('old-refresh')).rejects.not.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });
});
