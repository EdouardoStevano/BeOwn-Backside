import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { MfaMethod } from 'src/iam/domains/models/mfa-method';
import type { MfaMethodRepository } from 'src/iam/domains/ports/mfa-method.repository';
import { OtpService } from 'src/iam/applications/services/otp/otp.service';
import { AuthMailerService } from 'src/iam/applications/services/auth-mailer.service';
import type { SecretCipher } from 'src/iam/applications/ports/secret-cipher.port';
import type { TotpGenerator } from 'src/iam/applications/ports/totp-generator.port';
import { EmailChallengeStrategy } from '../strategies/email/email-challenge.strategy';
import { TotpChallengeStrategy } from '../strategies/totp/totp-challenge.strategy';
import type { MfaChallengeStrategy } from '../strategies/mfa/mfa-challenge.strategy';
import { ListMfaMethodsUseCase } from './list-mfa-methods.usecase';

const USER_ID = 42;
const ACCOUNT_EMAIL = 'jean.dupont@example.com';
const ENCRYPTED_SECRET = 'enc(PLAIN-SECRET)';

/** Repository qui rend, par canal, ce qu'on lui a donné. */
const makeRepository = (
  byMethod: Partial<Record<MfaMethodType, MfaMethod[]>>,
) => {
  const findAllByUserId = jest
    .fn()
    .mockImplementation((_userId: number, method: MfaMethodType) =>
      Promise.resolve(byMethod[method] ?? []),
    );

  return {
    findAllByUserId,
    repository: {
      create: jest.fn(),
      findAllByUserId,
      deletePendingForUser: jest.fn(),
      deactivateChannel: jest.fn(),
      deactivateAll: jest.fn(),
      activate: jest.fn(),
    } as unknown as MfaMethodRepository,
  };
};

const makeSut = (byMethod: Partial<Record<MfaMethodType, MfaMethod[]>>) => {
  const { repository, findAllByUserId } = makeRepository(byMethod);

  const email = new EmailChallengeStrategy(
    {} as unknown as OtpService,
    repository,
    {} as unknown as AuthMailerService,
  );
  const totp = new TotpChallengeStrategy(
    {} as unknown as TotpGenerator,
    repository,
    {} as unknown as SecretCipher,
  );

  return {
    usecase: new ListMfaMethodsUseCase([
      totp,
      email,
    ] as unknown as MfaChallengeStrategy[]),
    findAllByUserId,
  };
};

describe('ListMfaMethodsUseCase', () => {
  it('ne rend jamais le secret TOTP, sous aucune forme', async () => {
    // Le point qui compte : `credential` porte le secret partagé chiffré sur
    // ce canal. Même tronqué, il n'a rien à faire dans une réponse HTTP.
    const { usecase } = makeSut({
      [MfaMethodType.TOTP]: [
        MfaMethod.rehydrate({
          id: 1,
          method: MfaMethodType.TOTP,
          isActive: true,
          credential: ENCRYPTED_SECRET,
        }),
      ],
    });

    const methods = await usecase.execute(USER_ID);

    expect(methods).toEqual([{ method: MfaMethodType.TOTP, isActive: true }]);
    expect(JSON.stringify(methods)).not.toContain('PLAIN-SECRET');
    expect(JSON.stringify(methods)).not.toContain(ENCRYPTED_SECRET);
  });

  it('masque la destination des canaux qui en ont une', async () => {
    const { usecase } = makeSut({
      [MfaMethodType.EMAIL]: [
        MfaMethod.rehydrate({
          id: 2,
          method: MfaMethodType.EMAIL,
          isActive: true,
          credential: ACCOUNT_EMAIL,
        }),
      ],
    });

    const [method] = await usecase.execute(USER_ID);

    expect(method.sentTo).toBe('j***t@example.com');
    expect(method.sentTo).not.toBe(ACCOUNT_EMAIL);
  });

  it('rend les enrôlements non confirmés, qui occupent la place du canal', async () => {
    const { usecase } = makeSut({
      [MfaMethodType.EMAIL]: [
        MfaMethod.rehydrate({
          id: 3,
          method: MfaMethodType.EMAIL,
          isActive: false,
          credential: ACCOUNT_EMAIL,
        }),
      ],
    });

    const [method] = await usecase.execute(USER_ID);

    expect(method.isActive).toBe(false);
  });

  it('agrège les canaux plutôt que de rendre le premier trouvé', async () => {
    const { usecase } = makeSut({
      [MfaMethodType.TOTP]: [
        MfaMethod.rehydrate({
          id: 1,
          method: MfaMethodType.TOTP,
          isActive: true,
          credential: ENCRYPTED_SECRET,
        }),
      ],
      [MfaMethodType.EMAIL]: [
        MfaMethod.rehydrate({
          id: 2,
          method: MfaMethodType.EMAIL,
          isActive: true,
          credential: ACCOUNT_EMAIL,
        }),
      ],
    });

    const methods = await usecase.execute(USER_ID);

    expect(methods.map((m) => m.method)).toEqual([
      MfaMethodType.TOTP,
      MfaMethodType.EMAIL,
    ]);
  });

  it("rend une liste vide quand le compte n'a aucun facteur", async () => {
    // Une liste vide est une réponse valide : c'est ce que l'écran de sécurité
    // a besoin de savoir pour proposer un enrôlement.
    const { usecase } = makeSut({});

    await expect(usecase.execute(USER_ID)).resolves.toEqual([]);
  });

  it('interroge chaque canal pour le compte demandé', async () => {
    const { usecase, findAllByUserId } = makeSut({});

    await usecase.execute(USER_ID);

    expect(findAllByUserId).toHaveBeenCalledWith(USER_ID, MfaMethodType.TOTP);
    expect(findAllByUserId).toHaveBeenCalledWith(USER_ID, MfaMethodType.EMAIL);
  });
});
