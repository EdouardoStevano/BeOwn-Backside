import { SignInUsecase } from './sign-in.usecase';
import { MfaFactorService } from '../../services/mfa/mfa-factor.service';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { MfaChallengePurpose } from 'src/iam/applications/models/mfa-challenge';
import { type AuthSession } from 'src/iam/applications/models/auth-token';
import { User } from 'src/iam/domains/models/user';
import { buildUser as buildUserFixture } from 'src/iam/domains/models/user.fixture';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
import {
  ACCOUNT_CLOSED_CODE,
  ACCOUNT_SUSPENDED_CODE,
  AccountClosedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  IamError,
  INVALID_CREDENTIALS_MESSAGE,
  InvalidCredentialsError,
  MFA_REQUIRED_CODE,
  MfaRequiredError,
  OTP_REQUIRED_CODE,
} from 'src/iam/domains/errors';

const buildUser = (status: UserStatus, emailVerified = true): User =>
  buildUserFixture({ status, emailVerified });

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
    // Trace du dernier contact émanant de la personne (barème RGPD ligne 2).
    touchLastLogin: jest.fn().mockResolvedValue(undefined),
    // Accès porteur : lecture ciblée hors agrégat, jointe au profil de session
    // pour que le front connaisse l'état de l'espace porteur dès la connexion.
    findAccesPorteur: jest
      .fn()
      .mockResolvedValue(
        user
          ? { role: user.role, porteurAccess: false, accesRevoqueLe: null }
          : null,
      ),
  };
  // Par défaut, aucun facteur MFA actif : la connexion se termine en un temps,
  // comme avant l'introduction de la double authentification.
  const challengeStrategy = {
    method: MfaMethodType.TOTP,
    isActiveFor: jest.fn().mockResolvedValue(false),
    issue: jest.fn().mockResolvedValue({}),
    verify: jest.fn(),
    deactivate: jest.fn(),
  };
  const mfaFactors = new MfaFactorService([challengeStrategy as any]);
  const mfaChallenges = {
    issue: jest.fn((draft: unknown) =>
      Promise.resolve({
        ...(draft as object),
        id: 'challenge-1',
        attemptsLeft: 3,
      }),
    ),
    find: jest.fn(),
    registerFailedAttempt: jest.fn(),
    discard: jest.fn(),
  };

  const usecase = new SignInUsecase(
    hashingService as any,
    tokenService as any,
    usersRepository as any,
    mfaFactors,
    mfaChallenges as any,
  );
  return {
    usecase,
    hashingService,
    tokenService,
    usersRepository,
    challengeStrategy,
    mfaChallenges,
  };
};

/** Capture l'erreur de domaine levée par le use case. */
const catchError = async (fn: () => Promise<unknown>): Promise<IamError> => {
  try {
    await fn();
  } catch (e) {
    return e as IamError;
  }
  throw new Error('Aucune erreur levée alors qu’une était attendue.');
};

describe('SignInUsecase', () => {
  it('connecte un compte actif et renvoie les tokens AVEC le compte', async () => {
    const { usecase, tokenService } = makeUsecase(buildUser(UserStatus.ACTIF));

    const session: AuthSession = await usecase.execute({
      email: 'user@example.com',
      password: 'pw',
    });

    expect(session).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(session.user).toMatchObject({
      userId: 42,
      role: 'investisseur',
      status: UserStatus.ACTIF,
    });
    expect(session.user.userEmail?.email).toBe('user@example.com');
    // Compte sans facteur : le front le lit sur la session, sans enchaîner un
    // GET /auth/mfa/methods.
    expect(session.user.mfa).toEqual({ enabled: false, method: null });
    // Le contrat exclut l'empreinte du mot de passe, sous n'importe quelle clé.
    expect(JSON.stringify(session)).not.toMatch(/password/i);
    expect(tokenService.generateTokens).toHaveBeenCalled();
  });

  it('publie le facteur actif quand la session est ouverte par openSession', async () => {
    const { usecase } = makeUsecase(buildUser(UserStatus.ACTIF));

    const session = await usecase.openSession(
      buildUser(UserStatus.ACTIF),
      MfaMethodType.SMS,
    );

    expect(session.user.mfa).toEqual({
      enabled: true,
      method: MfaMethodType.SMS,
    });
  });

  /**
   * `users.lastLoginAt` n'était écrit NULLE PART. La purge des prospects
   * inactifs (barème ligne 2, 3 ans depuis le dernier contact émanant du
   * prospect) retombait donc systématiquement sur `createdAt` par son
   * `COALESCE` : un compte activé, connecté régulièrement, mais inscrit depuis
   * plus de trois ans et sans KYC ni investissement était supprimé sur sa date
   * d'INSCRIPTION.
   */
  describe('trace du dernier contact (lastLoginAt)', () => {
    it('une connexion réussie horodate le compte', async () => {
      const { usecase, usersRepository } = makeUsecase(
        buildUser(UserStatus.ACTIF),
      );

      await usecase.execute({ email: 'user@example.com', password: 'pw' });

      expect(usersRepository.touchLastLogin).toHaveBeenCalledWith(
        42,
        expect.any(Date),
      );
    });

    it('posée dans openSession : le second facteur horodate la même connexion, une seule fois', async () => {
      const { usecase, usersRepository } = makeUsecase(
        buildUser(UserStatus.ACTIF),
      );

      await usecase.openSession(buildUser(UserStatus.ACTIF), MfaMethodType.SMS);

      expect(usersRepository.touchLastLogin).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['mot de passe invalide', UserStatus.ACTIF, false],
      ['compte suspendu', UserStatus.SUSPENDU, true],
      ['compte clos', UserStatus.CLOS, true],
    ])(
      'une tentative refusée (%s) n’est PAS un contact : rien n’est écrit',
      async (_label, status, passwordValid) => {
        const { usecase, usersRepository } = makeUsecase(
          buildUser(status),
          passwordValid,
        );

        await catchError(() =>
          usecase.execute({ email: 'user@example.com', password: 'pw' }),
        );

        expect(usersRepository.touchLastLogin).not.toHaveBeenCalled();
      },
    );

    it("un défi MFA en attente n'horodate rien : la session n'est pas ouverte", async () => {
      const { usecase, usersRepository, challengeStrategy } = makeUsecase(
        buildUser(UserStatus.ACTIF),
      );
      challengeStrategy.isActiveFor.mockResolvedValue(true);
      challengeStrategy.issue.mockResolvedValue({ sentTo: 'j***n@example.com' });

      await catchError(() =>
        usecase.execute({ email: 'user@example.com', password: 'pw' }),
      );

      expect(usersRepository.touchLastLogin).not.toHaveBeenCalled();
    });

    /**
     * La trace ne doit jamais prendre la session en otage : échanger une
     * indisponibilité de connexion contre une commodité de purge serait un
     * mauvais marché.
     */
    it('un échec d’écriture est journalisé, la session s’ouvre quand même', async () => {
      const { usecase, usersRepository } = makeUsecase(
        buildUser(UserStatus.ACTIF),
      );
      usersRepository.touchLastLogin.mockRejectedValue(
        new Error('base indisponible'),
      );

      const session = await usecase.execute({
        email: 'user@example.com',
        password: 'pw',
      });

      expect(session.accessToken).toBe('access');
    });
  });

  describe('double authentification', () => {
    it('lève MFA_REQUIRED au lieu de rendre des tokens quand un facteur est actif', async () => {
      const { usecase, tokenService, challengeStrategy, mfaChallenges } =
        makeUsecase(buildUser(UserStatus.ACTIF));
      challengeStrategy.isActiveFor.mockResolvedValue(true);
      challengeStrategy.issue.mockResolvedValue({
        sentTo: 'j***n@example.com',
      });

      const caught = await catchError(() =>
        usecase.execute({ email: 'user@example.com', password: 'pw' }),
      );

      // Une erreur et non un résultat : un retour normal de `execute` signifie
      // désormais « session ouverte », sans exception à chercher dans le corps.
      expect(caught).toBeInstanceOf(MfaRequiredError);
      expect(caught.code).toBe(MFA_REQUIRED_CODE);
      // De quoi relever le défi, et rien de plus.
      expect(caught.details).toEqual({
        challengeId: 'challenge-1',
        method: MfaMethodType.TOTP,
        sentTo: 'j***n@example.com',
      });
      // Ni tokens ni profil : le mot de passe seul ne donne rien à voir du
      // compte tant que le second facteur n'est pas prouvé.
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
      expect(JSON.stringify(caught.details)).not.toMatch(
        /accessToken|userEmail/,
      );
      expect(mfaChallenges.issue).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          method: MfaMethodType.TOTP,
          purpose: MfaChallengePurpose.SIGN_IN,
        }),
      );
    });

    it('n’émet aucun défi avant que le mot de passe ne soit validé', async () => {
      const { usecase, challengeStrategy, mfaChallenges } = makeUsecase(
        buildUser(UserStatus.ACTIF),
        false,
      );
      challengeStrategy.isActiveFor.mockResolvedValue(true);

      await catchError(() =>
        usecase.execute({ email: 'user@example.com', password: 'wrong' }),
      );

      // Sinon saisir une adresse au hasard déclencherait un SMS, et révélerait
      // au passage qu'elle correspond à un compte.
      expect(challengeStrategy.issue).not.toHaveBeenCalled();
      expect(mfaChallenges.issue).not.toHaveBeenCalled();
    });

    it.each([UserStatus.SUSPENDU, UserStatus.CLOS])(
      'n’émet aucun défi sur un compte %s',
      async (status) => {
        const { usecase, challengeStrategy, mfaChallenges } = makeUsecase(
          buildUser(status),
        );
        challengeStrategy.isActiveFor.mockResolvedValue(true);

        await catchError(() =>
          usecase.execute({ email: 'user@example.com', password: 'pw' }),
        );

        expect(challengeStrategy.issue).not.toHaveBeenCalled();
        expect(mfaChallenges.issue).not.toHaveBeenCalled();
      },
    );
  });

  it('refuse (code ACCOUNT_SUSPENDED) un compte suspendu, sans générer de token', async () => {
    const { usecase, tokenService } = makeUsecase(
      buildUser(UserStatus.SUSPENDU),
    );
    const caught = await catchError(() =>
      usecase.execute({ email: 'user@example.com', password: 'pw' }),
    );
    expect(caught).toBeInstanceOf(AccountSuspendedError);
    expect(caught.code).toBe(ACCOUNT_SUSPENDED_CODE);
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it.each([UserStatus.CLOS, UserStatus.SUPPRIME])(
    'refuse (code ACCOUNT_CLOSED) le statut %s, sans générer de token',
    async (status) => {
      const { usecase, tokenService } = makeUsecase(buildUser(status));
      const caught = await catchError(() =>
        usecase.execute({ email: 'user@example.com', password: 'pw' }),
      );
      expect(caught).toBeInstanceOf(AccountClosedError);
      expect(caught.code).toBe(ACCOUNT_CLOSED_CODE);
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    },
  );

  it('refuse un email non vérifié, après vérification du mot de passe, avant même de regarder le statut', async () => {
    const user = buildUser(UserStatus.SUSPENDU, false);
    const { usecase, hashingService } = makeUsecase(user);
    const caught = await catchError(() =>
      usecase.execute({ email: 'user@example.com', password: 'pw' }),
    );
    expect(caught).toBeInstanceOf(EmailNotVerifiedError);
    expect(caught.code).toBe(OTP_REQUIRED_CODE);
    // Le mot de passe a bien été vérifié avant que le code OTP_REQUIRED
    // ne soit renvoyé (anti-enumeration : ce code ne doit jamais fuiter sans
    // preuve de connaissance du mot de passe).
    expect(hashingService.compare).toHaveBeenCalled();
  });

  it('refuse un email inconnu', async () => {
    const { usecase } = makeUsecase(null);
    await expect(
      usecase.execute({ email: 'nobody@example.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  describe('anti-enumeration : le mot de passe est vérifié avant tout code de statut informatif', () => {
    it('renvoie le message générique (pas OTP_REQUIRED) si le mot de passe est incorrect sur un compte non vérifié', async () => {
      const user = buildUser(UserStatus.ACTIF, false);
      const { usecase, tokenService } = makeUsecase(user, false);
      const caught = await catchError(() =>
        usecase.execute({ email: 'user@example.com', password: 'wrong' }),
      );
      expect(caught).toBeInstanceOf(InvalidCredentialsError);
      expect(caught.message).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('renvoie le message générique (pas ACCOUNT_SUSPENDED) si le mot de passe est incorrect sur un compte suspendu', async () => {
      const user = buildUser(UserStatus.SUSPENDU);
      const { usecase, tokenService } = makeUsecase(user, false);
      const caught = await catchError(() =>
        usecase.execute({ email: 'user@example.com', password: 'wrong' }),
      );
      expect(caught).toBeInstanceOf(InvalidCredentialsError);
      expect(caught.message).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    });

    it.each([UserStatus.CLOS, UserStatus.SUPPRIME])(
      'renvoie le message générique (pas ACCOUNT_CLOSED) si le mot de passe est incorrect sur un compte %s',
      async (status) => {
        const user = buildUser(status);
        const { usecase, tokenService } = makeUsecase(user, false);
        const caught = await catchError(() =>
          usecase.execute({ email: 'user@example.com', password: 'wrong' }),
        );
        expect(caught).toBeInstanceOf(InvalidCredentialsError);
        expect(caught.message).toBe(INVALID_CREDENTIALS_MESSAGE);
        expect(tokenService.generateTokens).not.toHaveBeenCalled();
      },
    );
  });
});
