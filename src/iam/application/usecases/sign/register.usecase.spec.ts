import { RegisterUseCase } from './register.usecase';
import { EmailAlreadyRegisteredError } from 'src/iam/domain/errors';
import { User } from 'src/iam/domain/aggregates/user';
import { buildUser as buildUserFixture } from 'src/iam/domain/aggregates/user.fixture';
import { UserStatus } from 'src/iam/domain/enums/user.enum';
import { UserRegisteredDomainEvent } from 'src/iam/domain/events/user-registered.domain-event';

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
  const eventBus = { publish: jest.fn() };

  const usecase = new RegisterUseCase(
    userFactory as any,
    userRepository as any,
    eventBus as any,
  );

  return {
    usecase,
    userFactory,
    userRepository,
    eventBus,
    created,
  };
};

describe('RegisterUseCase', () => {
  it('crée le compte et rend l’utilisateur persisté', async () => {
    const { usecase, userRepository, created } = makeUsecase();

    const user = await usecase.execute(INPUT);

    expect(user).toBe(created);
    expect(userRepository.save).toHaveBeenCalled();
  });

  it('annonce l’inscription, une fois le compte persisté', async () => {
    const { usecase, userRepository, eventBus, created } = makeUsecase();

    await usecase.execute(INPUT);

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: created.userId,
        email: created.email,
        firstname: created.firstname,
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(UserRegisteredDomainEvent),
    );

    // Publier avant la sauvegarde ferait réagir des abonnés à un compte qui
    // peut encore ne jamais exister.
    const saveOrder = userRepository.save.mock.invocationCallOrder[0];
    const publishOrder = eventBus.publish.mock.invocationCallOrder[0];
    expect(publishOrder).toBeGreaterThan(saveOrder);
  });

  it('n’annonce rien quand l’adresse est déjà inscrite', async () => {
    const { usecase, eventBus } = makeUsecase(buildUserFixture());

    await expect(usecase.execute(INPUT)).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('email déjà inscrit : 409 sans création', async () => {
    const { usecase, userFactory, userRepository } =
      makeUsecase(buildUserFixture());

    await expect(usecase.execute(INPUT)).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
    expect(userFactory.create).not.toHaveBeenCalled();
    expect(userRepository.save).not.toHaveBeenCalled();
  });
});
