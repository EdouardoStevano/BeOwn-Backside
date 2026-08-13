import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import {
  MfaChallengePurpose,
  type MfaChallenge,
} from 'src/iam/applications/models/mfa-challenge';
import {
  InvalidOtpCodeError,
  MfaChallengeNotFoundError,
  MfaChallengePurposeMismatchError,
  NoActiveMfaMethodError,
  NoPendingMfaEnrollmentError,
} from 'src/iam/domains/errors';
import { buildUser as buildUserFixture } from 'src/iam/domains/models/user.fixture';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
import { MfaFactorService } from '../services/mfa-factor.service';
import { EnableMfaUseCase } from './enable-mfa.usecase';
import { DisableMfaUseCase } from './disable-mfa.usecase';
import { VerifyMfaChallengeUseCase } from './verify-mfa-challenge.usecase';

/** Stratégie de vérification factice, pilotable canal par canal. */
const makeChallengeStrategy = (method: TfaMethodType) => ({
  method,
  isActiveFor: jest.fn().mockResolvedValue(false),
  issue: jest.fn().mockResolvedValue({}),
  verify: jest.fn().mockResolvedValue(false),
  deactivate: jest.fn().mockResolvedValue(undefined),
});

/** Stratégie d'enrôlement factice. */
const makeEnrollmentStrategy = (method: TfaMethodType) => ({
  method,
  start: jest.fn(),
  confirm: jest.fn().mockResolvedValue(undefined),
  hasPending: jest.fn().mockResolvedValue(false),
});

/** Store de challenges en mémoire, fidèle au contrat du port. */
const makeChallengeStore = () => {
  const stored = new Map<string, MfaChallenge>();
  let counter = 0;

  return {
    stored,
    issue: jest.fn((draft: Omit<MfaChallenge, 'id' | 'attemptsLeft'>) => {
      const challenge: MfaChallenge = {
        ...draft,
        id: `challenge-${++counter}`,
        attemptsLeft: 3,
      };
      stored.set(challenge.id, challenge);
      return Promise.resolve(challenge);
    }),
    find: jest.fn((id: string) => Promise.resolve(stored.get(id) ?? null)),
    registerFailedAttempt: jest.fn((id: string) => {
      const challenge = stored.get(id);
      if (!challenge) return Promise.resolve();
      if (challenge.attemptsLeft <= 1) stored.delete(id);
      else
        stored.set(id, {
          ...challenge,
          attemptsLeft: challenge.attemptsLeft - 1,
        });
      return Promise.resolve();
    }),
    discard: jest.fn((id: string) => {
      stored.delete(id);
      return Promise.resolve();
    }),
  };
};

describe('EnableMfaUseCase', () => {
  const build = () => {
    const totp = makeEnrollmentStrategy(TfaMethodType.TOTP);
    const email = makeEnrollmentStrategy(TfaMethodType.EMAIL);
    const usecase = new EnableMfaUseCase([totp, email] as any);
    return { usecase, totp, email };
  };

  it('déduit le canal de l’enrôlement en attente, sans champ `method`', async () => {
    const { usecase, totp, email } = build();
    email.hasPending.mockResolvedValue(true);

    await expect(usecase.execute({ userId: 42, code: '123456' })).resolves.toBe(
      TfaMethodType.EMAIL,
    );

    expect(email.confirm).toHaveBeenCalledWith({
      method: TfaMethodType.EMAIL,
      userId: 42,
      otp: '123456',
    });
    // Un canal sans enrôlement en attente n'est jamais sollicité.
    expect(totp.confirm).not.toHaveBeenCalled();
  });

  it('refuse quand aucun enrôlement n’est en cours', async () => {
    const { usecase } = build();

    await expect(
      usecase.execute({ userId: 42, code: '123456' }),
    ).rejects.toBeInstanceOf(NoPendingMfaEnrollmentError);
  });

  it('deux enrôlements en attente : c’est le code qui tranche', async () => {
    const { usecase, totp, email } = build();
    totp.hasPending.mockResolvedValue(true);
    email.hasPending.mockResolvedValue(true);
    totp.confirm.mockRejectedValue(new InvalidOtpCodeError());

    await expect(usecase.execute({ userId: 42, code: '123456' })).resolves.toBe(
      TfaMethodType.EMAIL,
    );
  });

  it('relève « code invalide » si aucun canal ne reconnaît le code', async () => {
    const { usecase, totp } = build();
    totp.hasPending.mockResolvedValue(true);
    totp.confirm.mockRejectedValue(new InvalidOtpCodeError());

    await expect(
      usecase.execute({ userId: 42, code: '000000' }),
    ).rejects.toBeInstanceOf(InvalidOtpCodeError);
  });
});

describe('VerifyMfaChallengeUseCase', () => {
  const build = () => {
    const strategy = makeChallengeStrategy(TfaMethodType.TOTP);
    const challenges = makeChallengeStore();
    const user = buildUserFixture({ status: UserStatus.ACTIF });
    const userRepository = { findById: jest.fn().mockResolvedValue(user) };
    const signIn = {
      openSession: jest
        .fn()
        .mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} }),
    };

    const usecase = new VerifyMfaChallengeUseCase(
      challenges as any,
      userRepository as any,
      new MfaFactorService([strategy as any]),
      signIn as any,
    );

    return { usecase, strategy, challenges, signIn, userRepository };
  };

  const issueSignInChallenge = (
    challenges: ReturnType<typeof makeChallengeStore>,
  ) =>
    challenges.issue({
      userId: 42,
      method: TfaMethodType.TOTP,
      purpose: MfaChallengePurpose.SIGN_IN,
    });

  it('ouvre la session quand le code est bon, et consomme le challenge', async () => {
    const { usecase, strategy, challenges, signIn } = build();
    const challenge = await issueSignInChallenge(challenges);
    strategy.verify.mockResolvedValue(true);

    await expect(
      usecase.execute({ challengeId: challenge.id, code: '123456' }),
    ).resolves.toMatchObject({ accessToken: 'a' });

    expect(signIn.openSession).toHaveBeenCalled();
    expect(challenges.stored.has(challenge.id)).toBe(false);
  });

  it('décompte un essai sur code faux, sans détruire le challenge au premier', async () => {
    const { usecase, challenges } = build();
    const challenge = await issueSignInChallenge(challenges);

    await expect(
      usecase.execute({ challengeId: challenge.id, code: '000000' }),
    ).rejects.toBeInstanceOf(InvalidOtpCodeError);

    // Une faute de frappe ne doit pas obliger à refaire toute la connexion.
    expect(challenges.stored.get(challenge.id)?.attemptsLeft).toBe(2);
  });

  it('détruit le challenge une fois les essais épuisés', async () => {
    const { usecase, challenges } = build();
    const challenge = await issueSignInChallenge(challenges);

    for (let i = 0; i < 3; i++) {
      await usecase
        .execute({ challengeId: challenge.id, code: '000000' })
        .catch(() => undefined);
    }

    expect(challenges.stored.has(challenge.id)).toBe(false);
    await expect(
      usecase.execute({ challengeId: challenge.id, code: '123456' }),
    ).rejects.toBeInstanceOf(MfaChallengeNotFoundError);
  });

  it('refuse un challenge émis pour la désactivation', async () => {
    const { usecase, challenges, strategy } = build();
    const challenge = await challenges.issue({
      userId: 42,
      method: TfaMethodType.TOTP,
      purpose: MfaChallengePurpose.DISABLE,
    });
    strategy.verify.mockResolvedValue(true);

    await expect(
      usecase.execute({ challengeId: challenge.id, code: '123456' }),
    ).rejects.toBeInstanceOf(MfaChallengePurposeMismatchError);
  });

  it('applique une suspension prononcée entre les deux étapes', async () => {
    const { usecase, strategy, challenges, userRepository, signIn } = build();
    const challenge = await issueSignInChallenge(challenges);
    strategy.verify.mockResolvedValue(true);
    userRepository.findById.mockResolvedValue(
      buildUserFixture({ status: UserStatus.SUSPENDU }),
    );

    await expect(
      usecase.execute({ challengeId: challenge.id, code: '123456' }),
    ).rejects.toThrow();
    expect(signIn.openSession).not.toHaveBeenCalled();
  });
});

describe('DisableMfaUseCase', () => {
  const build = () => {
    const strategy = makeChallengeStrategy(TfaMethodType.EMAIL);
    const challenges = makeChallengeStore();
    const usecase = new DisableMfaUseCase(
      challenges as any,
      new MfaFactorService([strategy as any]),
    );
    return { usecase, strategy, challenges };
  };

  it('premier temps : émet le code sur le canal actif et rend un challengeId', async () => {
    const { usecase, strategy } = build();
    strategy.isActiveFor.mockResolvedValue(true);
    strategy.issue.mockResolvedValue({ sentTo: 'j***n@example.com' });

    await expect(usecase.request({ userId: 42 })).resolves.toEqual({
      challengeId: 'challenge-1',
      method: TfaMethodType.EMAIL,
      sentTo: 'j***n@example.com',
    });
  });

  it('refuse d’émettre quand le compte n’a aucun facteur actif', async () => {
    const { usecase, strategy } = build();

    await expect(usecase.request({ userId: 42 })).rejects.toBeInstanceOf(
      NoActiveMfaMethodError,
    );
    expect(strategy.issue).not.toHaveBeenCalled();
  });

  it('second temps : retire le facteur quand le code est bon', async () => {
    const { usecase, strategy, challenges } = build();
    strategy.isActiveFor.mockResolvedValue(true);
    const { challengeId } = await usecase.request({ userId: 42 });
    strategy.verify.mockResolvedValue(true);

    await expect(
      usecase.confirm({ userId: 42, challengeId, code: '123456' }),
    ).resolves.toBe(TfaMethodType.EMAIL);

    expect(strategy.deactivate).toHaveBeenCalledWith(42);
    expect(challenges.stored.has(challengeId)).toBe(false);
  });

  it('ne retire rien sur code faux', async () => {
    const { usecase, strategy } = build();
    strategy.isActiveFor.mockResolvedValue(true);
    const { challengeId } = await usecase.request({ userId: 42 });

    await expect(
      usecase.confirm({ userId: 42, challengeId, code: '000000' }),
    ).rejects.toBeInstanceOf(InvalidOtpCodeError);
    expect(strategy.deactivate).not.toHaveBeenCalled();
  });

  it('refuse un challenge appartenant à un autre compte', async () => {
    const { usecase, strategy } = build();
    strategy.isActiveFor.mockResolvedValue(true);
    strategy.verify.mockResolvedValue(true);
    const { challengeId } = await usecase.request({ userId: 42 });

    await expect(
      usecase.confirm({ userId: 99, challengeId, code: '123456' }),
    ).rejects.toBeInstanceOf(MfaChallengePurposeMismatchError);
    expect(strategy.deactivate).not.toHaveBeenCalled();
  });

  it('refuse un challenge de connexion rejoué sur la désactivation', async () => {
    const { usecase, strategy, challenges } = build();
    strategy.verify.mockResolvedValue(true);
    const challenge = await challenges.issue({
      userId: 42,
      method: TfaMethodType.EMAIL,
      purpose: MfaChallengePurpose.SIGN_IN,
    });

    await expect(
      usecase.confirm({
        userId: 42,
        challengeId: challenge.id,
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(MfaChallengePurposeMismatchError);
    expect(strategy.deactivate).not.toHaveBeenCalled();
  });
});
