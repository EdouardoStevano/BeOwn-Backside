import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import {
  MfaChallengePurpose,
  type MfaChallenge,
  type MfaChallengeDraft,
} from 'src/iam/applications/models/mfa-challenge';
import {
  InvalidOtpCodeError,
  MfaChallengeNotFoundError,
  MfaChallengeNotResendableError,
  MfaChallengePurposeMismatchError,
  NoActiveMfaMethodError,
  NoPendingMfaEnrollmentError,
} from 'src/iam/domains/errors';
import {
  buildFacteur,
  buildUser as buildUserFixture,
} from 'src/iam/domains/models/user.fixture';
import type { MfaMethod } from 'src/iam/domains/models/mfa-method';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
import { MfaFactorService } from '../../services/mfa/mfa-factor.service';
import { EnableMfaUseCase } from './enable-mfa.usecase';
import { DisableMfaUseCase } from './disable-mfa.usecase';
import { VerifyMfaChallengeUseCase } from './verify-mfa-challenge.usecase';
import { CompleteMfaSignInUseCase } from './complete-mfa-sign-in.usecase';
import { ResendMfaChallengeUseCase } from './resend-mfa-challenge.usecase';

/**
 * `MfaFactorService` demande au compte quel facteur opposer : c'est l'agrégat
 * qui porte les facteurs et l'ordre de préférence. On lui fournit donc un
 * compte, plus seulement des stratégies.
 */
const makeFactorService = (strategies: unknown[], facteurs: MfaMethod[] = []) =>
  new MfaFactorService(
    strategies as any,
    {
      findByIdWithFacteurs: jest
        .fn()
        .mockResolvedValue(buildUserFixture({ facteurs })),
      update: jest.fn(),
    } as any,
  );

/** Stratégie de vérification factice, pilotable canal par canal. */
const makeChallengeStrategy = (method: MfaMethodType) => ({
  method,
  isActiveFor: jest.fn().mockResolvedValue(false),
  issue: jest.fn().mockResolvedValue({}),
  verify: jest.fn().mockResolvedValue(false),
  deactivate: jest.fn().mockResolvedValue(undefined),
});

/** Stratégie d'enrôlement factice. */
const makeEnrollmentStrategy = (method: MfaMethodType) => ({
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
    issue: jest.fn((draft: MfaChallengeDraft) => {
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
    const totp = makeEnrollmentStrategy(MfaMethodType.TOTP);
    const email = makeEnrollmentStrategy(MfaMethodType.EMAIL);
    const usecase = new EnableMfaUseCase([totp, email] as any);
    return { usecase, totp, email };
  };

  it('déduit le canal de l’enrôlement en attente, sans champ `method`', async () => {
    const { usecase, totp, email } = build();
    email.hasPending.mockResolvedValue(true);

    await expect(usecase.execute({ userId: 42, code: '123456' })).resolves.toBe(
      MfaMethodType.EMAIL,
    );

    expect(email.confirm).toHaveBeenCalledWith({
      method: MfaMethodType.EMAIL,
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
      MfaMethodType.EMAIL,
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

/**
 * Fabrique commune aux deux use cases du parcours : ils partagent le même
 * store et la même stratégie, seule diffère l'action tirée de la preuve.
 */
const buildMfaSignIn = () => {
  const strategy = makeChallengeStrategy(MfaMethodType.TOTP);
  const challenges = makeChallengeStore();
  const user = buildUserFixture({ status: UserStatus.ACTIF });
  const userRepository = { findById: jest.fn().mockResolvedValue(user) };
  const signIn = {
    openSession: jest
      .fn()
      .mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} }),
  };

  const verify = new VerifyMfaChallengeUseCase(
    challenges as any,
    makeFactorService([strategy]),
  );
  const complete = new CompleteMfaSignInUseCase(
    verify,
    challenges as any,
    userRepository as any,
    signIn as any,
  );

  return { verify, complete, strategy, challenges, signIn, userRepository };
};

const issueSignInChallenge = (
  challenges: ReturnType<typeof makeChallengeStore>,
) =>
  challenges.issue({
    userId: 42,
    method: MfaMethodType.TOTP,
    purpose: MfaChallengePurpose.SIGN_IN,
  });

// Aucune route n'expose ce use case : il est la brique de vérification que
// partagent la connexion et le retrait de facteur. Les tests l'éprouvent donc
// par `prove()`, son unique entrée.
describe('VerifyMfaChallengeUseCase', () => {
  it('constate que le code est bon — sans ouvrir de session', async () => {
    const { verify, strategy, challenges, signIn } = buildMfaSignIn();
    const challenge = await issueSignInChallenge(challenges);
    strategy.verify.mockResolvedValue(true);

    await expect(
      verify.prove({ challengeId: challenge.id, code: '123456' }),
    ).resolves.toMatchObject({
      id: challenge.id,
      method: MfaMethodType.TOTP,
    });

    // Rien de ce qui appartient à la connexion ne doit se produire ici.
    expect(signIn.openSession).not.toHaveBeenCalled();
  });

  it('ne consomme pas le challenge : c’est à l’appelant de le retirer', async () => {
    const { verify, complete, strategy, challenges } = buildMfaSignIn();
    const challenge = await issueSignInChallenge(challenges);
    strategy.verify.mockResolvedValue(true);

    await verify.prove({ challengeId: challenge.id, code: '123456' });

    expect(challenges.stored.has(challenge.id)).toBe(true);
    await expect(
      complete.execute({ challengeId: challenge.id, code: '123456' }),
    ).resolves.toMatchObject({ accessToken: 'a' });
  });

  it('décompte un essai sur code faux, sans détruire le challenge au premier', async () => {
    const { verify, challenges } = buildMfaSignIn();
    const challenge = await issueSignInChallenge(challenges);

    await expect(
      verify.prove({ challengeId: challenge.id, code: '000000' }),
    ).rejects.toBeInstanceOf(InvalidOtpCodeError);

    // Une faute de frappe ne doit pas obliger à refaire toute la connexion.
    expect(challenges.stored.get(challenge.id)?.attemptsLeft).toBe(2);
  });

  it('détruit le challenge une fois les essais épuisés', async () => {
    const { verify, challenges } = buildMfaSignIn();
    const challenge = await issueSignInChallenge(challenges);

    for (let i = 0; i < 3; i++) {
      await verify
        .prove({ challengeId: challenge.id, code: '000000' })
        .catch(() => undefined);
    }

    expect(challenges.stored.has(challenge.id)).toBe(false);
    await expect(
      verify.prove({ challengeId: challenge.id, code: '123456' }),
    ).rejects.toBeInstanceOf(MfaChallengeNotFoundError);
  });

  it('n’impose un `purpose` que si l’appelant en exige un', async () => {
    const { verify, challenges, strategy } = buildMfaSignIn();
    const challenge = await challenges.issue({
      userId: 42,
      method: MfaMethodType.TOTP,
      purpose: MfaChallengePurpose.DISABLE,
    });
    strategy.verify.mockResolvedValue(true);

    // Sans exigence : la preuve est constatée, elle n'ouvre aucun droit.
    await expect(
      verify.prove({ challengeId: challenge.id, code: '123456' }),
    ).resolves.toMatchObject({ purpose: MfaChallengePurpose.DISABLE });

    // Avec exigence : c'est le use case qui *agit* sur la preuve qui refuse.
    await expect(
      verify.prove(
        { challengeId: challenge.id, code: '123456' },
        MfaChallengePurpose.SIGN_IN,
      ),
    ).rejects.toBeInstanceOf(MfaChallengePurposeMismatchError);
  });
});

describe('CompleteMfaSignInUseCase', () => {
  it('ouvre la session quand le code est bon, et consomme le challenge', async () => {
    const { complete, strategy, challenges, signIn } = buildMfaSignIn();
    const challenge = await issueSignInChallenge(challenges);
    strategy.verify.mockResolvedValue(true);

    await expect(
      complete.execute({ challengeId: challenge.id, code: '123456' }),
    ).resolves.toMatchObject({ accessToken: 'a' });

    // Le canal prouvé est passé tel quel : c'est le facteur actif du compte,
    // que la session publie sans le relire.
    expect(signIn.openSession).toHaveBeenCalledWith(
      expect.anything(),
      MfaMethodType.TOTP,
    );
    expect(challenges.stored.has(challenge.id)).toBe(false);
  });

  it('n’ouvre aucune session sur code faux, et décompte l’essai', async () => {
    const { complete, challenges, signIn } = buildMfaSignIn();
    const challenge = await issueSignInChallenge(challenges);

    await expect(
      complete.execute({ challengeId: challenge.id, code: '000000' }),
    ).rejects.toBeInstanceOf(InvalidOtpCodeError);

    expect(signIn.openSession).not.toHaveBeenCalled();
    expect(challenges.stored.get(challenge.id)?.attemptsLeft).toBe(2);
  });

  it('refuse un challenge émis pour la désactivation', async () => {
    const { complete, challenges, strategy, signIn } = buildMfaSignIn();
    const challenge = await challenges.issue({
      userId: 42,
      method: MfaMethodType.TOTP,
      purpose: MfaChallengePurpose.DISABLE,
    });
    strategy.verify.mockResolvedValue(true);

    await expect(
      complete.execute({ challengeId: challenge.id, code: '123456' }),
    ).rejects.toBeInstanceOf(MfaChallengePurposeMismatchError);
    expect(signIn.openSession).not.toHaveBeenCalled();
  });

  it('applique une suspension prononcée entre les deux étapes', async () => {
    const { complete, strategy, challenges, userRepository, signIn } =
      buildMfaSignIn();
    const challenge = await issueSignInChallenge(challenges);
    strategy.verify.mockResolvedValue(true);
    userRepository.findById.mockResolvedValue(
      buildUserFixture({ status: UserStatus.SUSPENDU }),
    );

    await expect(
      complete.execute({ challengeId: challenge.id, code: '123456' }),
    ).rejects.toThrow();
    expect(signIn.openSession).not.toHaveBeenCalled();
  });

  it('rejoué avec le même code, le challenge consommé ne rouvre rien', async () => {
    const { complete, strategy, challenges } = buildMfaSignIn();
    const challenge = await issueSignInChallenge(challenges);
    strategy.verify.mockResolvedValue(true);

    await complete.execute({ challengeId: challenge.id, code: '123456' });

    await expect(
      complete.execute({ challengeId: challenge.id, code: '123456' }),
    ).rejects.toBeInstanceOf(MfaChallengeNotFoundError);
  });
});

describe('DisableMfaUseCase', () => {
  const build = (facteurs: MfaMethod[] = []) => {
    const strategy = makeChallengeStrategy(MfaMethodType.EMAIL);
    const challenges = makeChallengeStore();
    const usecase = new DisableMfaUseCase(
      challenges as any,
      makeFactorService([strategy], facteurs),
    );
    return { usecase, strategy, challenges };
  };

  /** Compte protégé par un facteur email actif. */
  const avecFacteurEmail = () => [
    buildFacteur({ method: MfaMethodType.EMAIL }),
  ];

  it('premier temps : émet le code sur le canal actif et rend un challengeId', async () => {
    const { usecase, strategy } = build(avecFacteurEmail());
    strategy.isActiveFor.mockResolvedValue(true);
    strategy.issue.mockResolvedValue({ sentTo: 'j***n@example.com' });

    await expect(usecase.request({ userId: 42 })).resolves.toEqual({
      challengeId: 'challenge-1',
      method: MfaMethodType.EMAIL,
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
    const { usecase, strategy, challenges } = build(avecFacteurEmail());
    strategy.isActiveFor.mockResolvedValue(true);
    const { challengeId } = await usecase.request({ userId: 42 });
    strategy.verify.mockResolvedValue(true);

    await expect(
      usecase.confirm({ userId: 42, challengeId, code: '123456' }),
    ).resolves.toBe(MfaMethodType.EMAIL);

    expect(strategy.deactivate).toHaveBeenCalledWith(42);
    expect(challenges.stored.has(challengeId)).toBe(false);
  });

  it('ne retire rien sur code faux', async () => {
    const { usecase, strategy } = build(avecFacteurEmail());
    strategy.isActiveFor.mockResolvedValue(true);
    const { challengeId } = await usecase.request({ userId: 42 });

    await expect(
      usecase.confirm({ userId: 42, challengeId, code: '000000' }),
    ).rejects.toBeInstanceOf(InvalidOtpCodeError);
    expect(strategy.deactivate).not.toHaveBeenCalled();
  });

  it('refuse un challenge appartenant à un autre compte', async () => {
    const { usecase, strategy } = build(avecFacteurEmail());
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
      method: MfaMethodType.EMAIL,
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

describe('ResendMfaChallengeUseCase', () => {
  const SIGN_IN = MfaChallengePurpose.SIGN_IN;

  const build = (method = MfaMethodType.EMAIL) => {
    const strategy = makeChallengeStrategy(method);
    const challenges = makeChallengeStore();
    const usecase = new ResendMfaChallengeUseCase(
      challenges as any,
      makeFactorService([strategy]),
    );
    return { usecase, strategy, challenges };
  };

  const issueSignIn = (
    challenges: ReturnType<typeof makeChallengeStore>,
    method = MfaMethodType.EMAIL,
  ) =>
    challenges.issue({
      userId: 42,
      method,
      purpose: MfaChallengePurpose.SIGN_IN,
    });

  it('réexpédie le code sans toucher au défi', async () => {
    const { usecase, strategy, challenges } = build();
    const challenge = await issueSignIn(challenges);
    strategy.issue.mockResolvedValue({ sentTo: 'j***n@example.com' });

    await expect(
      usecase.execute({ challengeId: challenge.id, purpose: SIGN_IN }),
    ).resolves.toEqual({
      challengeId: challenge.id,
      method: MfaMethodType.EMAIL,
      sentTo: 'j***n@example.com',
    });

    expect(strategy.issue).toHaveBeenCalledWith(42);
    // Le défi survit intact : même identifiant, mêmes essais restants.
    expect(challenges.stored.get(challenge.id)).toMatchObject({
      attemptsLeft: 3,
    });
    expect(challenges.stored.size).toBe(1);
  });

  it('n’accorde aucun essai supplémentaire', async () => {
    const { usecase, challenges } = build();
    const challenge = await issueSignIn(challenges);
    // Deux essais déjà consommés.
    await challenges.registerFailedAttempt(challenge.id);
    await challenges.registerFailedAttempt(challenge.id);

    await usecase.execute({ challengeId: challenge.id, purpose: SIGN_IN });

    // C'est tout l'intérêt de ne pas rejouer le défi : renvoyer un code en
    // boucle ne doit pas remettre le plafond de tentatives à neuf.
    expect(challenges.stored.get(challenge.id)?.attemptsLeft).toBe(1);
  });

  it('refuse TOTP, qui n’expédie rien', async () => {
    const { usecase, strategy, challenges } = build(MfaMethodType.TOTP);
    const challenge = await issueSignIn(challenges, MfaMethodType.TOTP);

    await expect(
      usecase.execute({ challengeId: challenge.id, purpose: SIGN_IN }),
    ).rejects.toBeInstanceOf(MfaChallengeNotResendableError);
    expect(strategy.issue).not.toHaveBeenCalled();
  });

  it('refuse un défi de désactivation', async () => {
    const { usecase, strategy, challenges } = build();
    const challenge = await challenges.issue({
      userId: 42,
      method: MfaMethodType.EMAIL,
      purpose: MfaChallengePurpose.DISABLE,
    });

    // Son titulaire a une session : il rappelle /auth/mfa/disable/challenge.
    // L'accepter ici ouvrirait un envoi non authentifié sans nécessité.
    await expect(
      usecase.execute({ challengeId: challenge.id, purpose: SIGN_IN }),
    ).rejects.toBeInstanceOf(MfaChallengePurposeMismatchError);
    expect(strategy.issue).not.toHaveBeenCalled();
  });

  it('sert aussi le retrait, quand le compte de la session correspond', async () => {
    const { usecase, strategy, challenges } = build();
    const challenge = await challenges.issue({
      userId: 42,
      method: MfaMethodType.EMAIL,
      purpose: MfaChallengePurpose.DISABLE,
    });
    strategy.issue.mockResolvedValue({ sentTo: 'j***n@example.com' });

    await expect(
      usecase.execute({
        challengeId: challenge.id,
        purpose: MfaChallengePurpose.DISABLE,
        userId: 42,
      }),
    ).resolves.toMatchObject({ challengeId: challenge.id });

    // Là encore le défi survit : c'est ce qui distingue ce renvoi d'un second
    // appel à `POST /auth/mfa/disable/challenge`, qui en frappe un neuf.
    expect(challenges.stored.get(challenge.id)?.attemptsLeft).toBe(3);
    expect(challenges.stored.size).toBe(1);
  });

  it('refuse un défi de retrait appartenant à un autre compte', async () => {
    const { usecase, strategy, challenges } = build();
    const challenge = await challenges.issue({
      userId: 42,
      method: MfaMethodType.EMAIL,
      purpose: MfaChallengePurpose.DISABLE,
    });

    await expect(
      usecase.execute({
        challengeId: challenge.id,
        purpose: MfaChallengePurpose.DISABLE,
        userId: 99,
      }),
    ).rejects.toBeInstanceOf(MfaChallengePurposeMismatchError);
    expect(strategy.issue).not.toHaveBeenCalled();
  });

  it('refuse un défi inconnu, sans rien envoyer', async () => {
    const { usecase, strategy } = build();

    await expect(
      usecase.execute({ challengeId: 'inconnu', purpose: SIGN_IN }),
    ).rejects.toBeInstanceOf(MfaChallengeNotFoundError);
    expect(strategy.issue).not.toHaveBeenCalled();
  });
});
