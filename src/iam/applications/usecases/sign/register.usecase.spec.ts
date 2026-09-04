import { RegisterUseCase } from './register.usecase';
import {
  CguNotAcceptedError,
  EmailAlreadyRegisteredError,
} from 'src/iam/domains/errors';
import { User } from 'src/iam/domains/models/user';
import { buildUser as buildUserFixture } from 'src/iam/domains/models/user.fixture';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
import { UserRegisteredDomainEvent } from 'src/iam/domains/events/user-registered.domain-event';

const INPUT = {
  firstname: 'Jean',
  email: 'user@example.com',
  password: 'S3cret!password',
  // Consentement CGU (lot 2) : requis par le usecase, cas de refus testés plus bas.
  accepteCgu: true,
  cguVersion: '1.0',
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
  it.each([
    ['absence du champ', { ...INPUT, accepteCgu: undefined }],
    ['acceptation à false', { ...INPUT, accepteCgu: false }],
    ['version vide', { ...INPUT, cguVersion: '   ' }],
    ['version absente', { ...INPUT, cguVersion: undefined }],
  ])(
    'refuse l’inscription sans consentement CGU exploitable : %s',
    async (_cas, entree) => {
      const { usecase, userRepository, eventBus } = makeUsecase();

      await expect(usecase.execute(entree as any)).rejects.toBeInstanceOf(
        CguNotAcceptedError,
      );
      // Refus AVANT toute lecture ou écriture : rien ne part en base, rien
      // n’est annoncé.
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    },
  );
});
