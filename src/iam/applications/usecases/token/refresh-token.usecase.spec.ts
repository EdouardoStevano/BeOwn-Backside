import { RefreshTokenUseCase } from './refresh-token.usecase';
import {
  AccountClosedError,
  AccountSuspendedError,
  InvalidRefreshTokenError,
} from 'src/iam/domains/errors';
import { User } from 'src/iam/domains/models/user';
import { buildUser as buildUserFixture } from 'src/iam/domains/models/user.fixture';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';

const makeUsecase = (
  user: User | null = buildUserFixture(),
  activeMfaMethod: MfaMethodType | null = null,
) => {
  const tokenService = {
    // Le token présenté ne rend plus que l'identité de la session : ni rôle,
    // ni tokens. L'émission est faite APRÈS la relecture du compte.
    consumeRefreshToken: jest
      .fn()
      .mockResolvedValue({ sub: 42, email: 'user@example.com' }),
    generateTokens: jest.fn().mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    }),
    verifyAccessToken: jest.fn(),
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
    updateUserType: jest.fn(),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn(),
    touchLastLogin: jest.fn().mockResolvedValue(undefined),
    // Relu à chaque rafraîchissement, comme le statut et le rôle : un accès
    // porteur accordé ou RETIRÉ depuis la connexion doit se voir sur la
    // session reprise.
    findAccesPorteur: jest
      .fn()
      .mockResolvedValue(
        user
          ? { role: user.role, porteurAccess: false, accesRevoqueLe: null }
          : null,
      ),
  };

  const mfaFactors = {
    findActiveMethod: jest.fn().mockResolvedValue(activeMfaMethod),
  };

  const usecase = new RefreshTokenUseCase(
    tokenService as any,
    userRepository as any,
    mfaFactors as any,
  );

  return { usecase, tokenService, userRepository, mfaFactors, user };
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
    // Le compte est relu à partir du `sub` du token consommé.
    expect(userRepository.findById).toHaveBeenCalledWith(42);
    // Aucune empreinte de mot de passe ne transite dans la réponse.
    expect(JSON.stringify(session)).not.toMatch(/password/i);
  });

  it('émet les tokens à partir du rôle EN BASE, jamais du claim entrant', async () => {
    // Cœur du correctif de sécurité : le token présenté ne sert qu'à désigner
    // `sub`. Le rôle qui fera autorité vient du dépôt utilisateur.
    const { usecase, tokenService } = makeUsecase(
      buildUserFixture({ status: UserStatus.ACTIF, role: UserRole.PORTEUR }),
    );

    await usecase.execute('old-refresh');

    expect(tokenService.generateTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 42,
        email: 'user@example.com',
        role: UserRole.PORTEUR,
      }),
    );
  });

  it("publie l'accès porteur RELU EN BASE sur la session reprise", async () => {
    // Anomalie de validation (P0, S1) : le drapeau n'apparaissait dans aucune
    // réponse. Le front ne pouvait pas savoir qu'un espace porteur venait de
    // s'ouvrir — ni, symétriquement, de se refermer.
    const { usecase, userRepository } = makeUsecase(
      buildUserFixture({ status: UserStatus.ACTIF }),
    );
    userRepository.findAccesPorteur.mockResolvedValue({
      role: UserRole.INVESTISSEUR,
      porteurAccess: true,
      accesRevoqueLe: null,
    });

    const session = await usecase.execute('old-refresh');

    expect(userRepository.findAccesPorteur).toHaveBeenCalledWith(42);
    expect(session.user.accesPorteur).toEqual({
      porteurAccess: true,
      espacePorteurOuvert: true,
    });
  });

  it('un accès RETIRÉ se voit dès le rafraîchissement suivant', async () => {
    // C'est ce qui rend le retrait perceptible côté front : la révocation de
    // session force précisément cette rotation.
    const { usecase, userRepository } = makeUsecase(
      buildUserFixture({ status: UserStatus.ACTIF }),
    );
    userRepository.findAccesPorteur.mockResolvedValue({
      role: UserRole.INVESTISSEUR,
      porteurAccess: false,
      accesRevoqueLe: new Date('2026-09-04T12:00:00.000Z'),
    });

    const session = await usecase.execute('old-refresh');

    expect(session.user.accesPorteur).toEqual({
      porteurAccess: false,
      espacePorteurOuvert: false,
    });
  });

  it('relit le compte AVANT d’émettre les nouveaux tokens', async () => {
    // L'ordre est le correctif : émettre puis relire laisserait le rôle du
    // claim entrant se recopier dans le token émis.
    const { usecase, tokenService, userRepository } = makeUsecase();

    await usecase.execute('old-refresh');

    expect(userRepository.findById.mock.invocationCallOrder[0]).toBeLessThan(
      tokenService.generateTokens.mock.invocationCallOrder[0],
    );
  });

  it('reflète l’état à jour du compte, pas celui figé dans l’ancien token', async () => {
    const { usecase } = makeUsecase(
      buildUserFixture({ status: UserStatus.ACTIF, role: UserRole.CGP }),
    );

    const session = await usecase.execute('old-refresh');

    expect(session.user.role).toBe(UserRole.CGP);
  });

  it('publie l’état MFA du compte, relu à chaque rafraîchissement', async () => {
    const { usecase, mfaFactors } = makeUsecase(
      buildUserFixture({ status: UserStatus.ACTIF }),
      MfaMethodType.TOTP,
    );

    const session = await usecase.execute('old-refresh');

    expect(session.user.mfa).toEqual({
      enabled: true,
      method: MfaMethodType.TOTP,
    });
    // Relu, et non repris du token : un facteur armé depuis la connexion doit
    // se voir sur la session reprise.
    expect(mfaFactors.findActiveMethod).toHaveBeenCalledWith(42);
  });

  it('compte sans facteur : `enabled: false`, et non un champ absent', async () => {
    const { usecase } = makeUsecase(
      buildUserFixture({ status: UserStatus.ACTIF }),
    );

    const session = await usecase.execute('old-refresh');

    expect(session.user.mfa).toEqual({ enabled: false, method: null });
  });

  it('refresh token invalide ou révoqué : 401, sans lecture en base', async () => {
    const { usecase, tokenService, userRepository } = makeUsecase();
    tokenService.consumeRefreshToken.mockRejectedValue(new Error('revoked'));

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

  it('compte suspendu : aucun token émis', async () => {
    // `POST /auth/refresh-tokens` étant public, AccountStatusGuard ne le
    // protège pas : sans ce contrôle, un compte sanctionné continuerait
    // d'obtenir des tokens valides.
    const { usecase, tokenService } = makeUsecase(
      buildUserFixture({ status: UserStatus.SUSPENDU }),
    );

    await expect(usecase.execute('old-refresh')).rejects.toBeInstanceOf(
      AccountSuspendedError,
    );
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('compte clos : aucun token émis', async () => {
    const { usecase, tokenService } = makeUsecase(
      buildUserFixture({ status: UserStatus.CLOS }),
    );

    await expect(usecase.execute('old-refresh')).rejects.toBeInstanceOf(
      AccountClosedError,
    );
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('une panne de base ne se déguise pas en token invalide', async () => {
    const { usecase, userRepository } = makeUsecase();
    userRepository.findById.mockRejectedValue(new Error('db down'));

    await expect(usecase.execute('old-refresh')).rejects.not.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  /**
   * Sur une session longue, on ne repasse jamais par le mot de passe : le
   * rafraîchissement est alors le SEUL signe de vie du compte. S'il n'était
   * pas horodaté, un utilisateur actif depuis des années resterait indistinct
   * d'un prospect abandonné pour la purge du barème (ligne 2).
   */
  describe('trace du dernier contact (lastLoginAt)', () => {
    it('un rafraîchissement réussi horodate le compte', async () => {
      const { usecase, userRepository } = makeUsecase(
        buildUserFixture({ status: UserStatus.ACTIF, emailVerified: true }),
      );

      await usecase.execute('old-refresh');

      expect(userRepository.touchLastLogin).toHaveBeenCalledWith(
        42,
        expect.any(Date),
      );
    });

    it.each([[UserStatus.SUSPENDU], [UserStatus.CLOS]])(
      'un compte %s ne rouvre aucune session : rien n’est écrit',
      async (status) => {
        const { usecase, userRepository } = makeUsecase(
          buildUserFixture({ status }),
        );

        await expect(usecase.execute('old-refresh')).rejects.toBeDefined();
        expect(userRepository.touchLastLogin).not.toHaveBeenCalled();
      },
    );

    it('un échec d’écriture ne fait pas échouer le rafraîchissement', async () => {
      const { usecase, userRepository } = makeUsecase(
        buildUserFixture({ status: UserStatus.ACTIF, emailVerified: true }),
      );
      userRepository.touchLastLogin.mockRejectedValue(new Error('db down'));

      const session = await usecase.execute('old-refresh');
      expect(session.accessToken).toBe('new-access');
    });
  });
});
