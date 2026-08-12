import { RegisterUseCase } from './register.usecase';
import { EmailAlreadyRegisteredError } from 'src/iam/domains/errors';
import { User } from 'src/iam/domains/models/user';
import { buildUser as buildUserFixture } from 'src/iam/domains/models/user.fixture';
import { UserStatus } from 'src/iam/domains/enums/user.enum';

const INPUT = {
  firstname: 'Jean',
  email: 'user@example.com',
  password: 'S3cret!password',
};

const makeUsecase = (existing: User | null = null) => {
  const created = buildUserFixture({
    status: UserStatus.CREE,
    emailVerified: false,
  });

  const userFactory = { create: jest.fn().mockResolvedValue(created) };
  const userRepository = {
    findByEmail: jest.fn().mockResolvedValue(existing),
    findById: jest.fn().mockResolvedValue(created),
    save: jest.fn().mockResolvedValue(created),
    update: jest.fn(),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn(),
  };
  const notificationEvents = { userRegistered: jest.fn() };
  const sendEmailVerificationUseCase = {
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const usecase = new RegisterUseCase(
    userFactory as any,
    userRepository as any,
    notificationEvents as any,
    sendEmailVerificationUseCase as any,
  );

  return {
    usecase,
    userFactory,
    userRepository,
    notificationEvents,
    sendEmailVerificationUseCase,
    created,
  };
};

describe('RegisterUseCase', () => {
  it('crée le compte puis envoie automatiquement le lien de vérification à l’adresse enregistrée', async () => {
    const { usecase, userRepository, sendEmailVerificationUseCase, created } =
      makeUsecase();

    const user = await usecase.execute(INPUT);

    expect(user).toBe(created);
    expect(userRepository.save).toHaveBeenCalled();
    // L'adresse envoyée est celle du compte persisté, pas celle du DTO : c'est
    // le compte qui fait foi si la factory l'a normalisée.
    expect(sendEmailVerificationUseCase.execute).toHaveBeenCalledWith(
      created.email,
    );
  });

  it('n’envoie le lien qu’après la persistance du compte', async () => {
    const { usecase, userRepository, sendEmailVerificationUseCase } =
      makeUsecase();

    await usecase.execute(INPUT);

    const saveOrder = userRepository.save.mock.invocationCallOrder[0];
    const sendOrder =
      sendEmailVerificationUseCase.execute.mock.invocationCallOrder[0];
    expect(sendOrder).toBeGreaterThan(saveOrder);
  });

  it('une panne du mailer ne fait pas échouer l’inscription (compte déjà persisté)', async () => {
    const { usecase, sendEmailVerificationUseCase, created } = makeUsecase();
    sendEmailVerificationUseCase.execute.mockRejectedValue(
      new Error('mail down'),
    );

    await expect(usecase.execute(INPUT)).resolves.toBe(created);
  });

  it('email déjà inscrit : 409 sans création ni envoi', async () => {
    const {
      usecase,
      userFactory,
      userRepository,
      sendEmailVerificationUseCase,
    } = makeUsecase(buildUserFixture());

    await expect(usecase.execute(INPUT)).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
    expect(userFactory.create).not.toHaveBeenCalled();
    expect(userRepository.save).not.toHaveBeenCalled();
    expect(sendEmailVerificationUseCase.execute).not.toHaveBeenCalled();
  });
});
