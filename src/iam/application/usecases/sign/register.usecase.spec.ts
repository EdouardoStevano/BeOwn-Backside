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

  const userFactory = {
    create: jest.fn().mockResolvedValue(created),
    // `reprendre` rend le compte reçu : c'est bien le même agrégat qui
    // ressort, pas un nouveau.
    reprendre: jest.fn((user: User) => Promise.resolve(user)),
  };
  const userRepository = {
    findByEmail: jest.fn().mockResolvedValue(existing),
    findById: jest.fn().mockResolvedValue(created),
    save: jest.fn((user: User) => Promise.resolve(user)),
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

  describe('inscription restée inachevée sur cette adresse', () => {
    const inachevee = () =>
      buildUserFixture({
        userId: 7,
        status: UserStatus.CREE,
        emailVerified: false,
      });

    it('reprend le compte existant au lieu d’en créer un second', async () => {
      const { usecase, userFactory } = makeUsecase(inachevee());

      await usecase.execute(INPUT);

      expect(userFactory.reprendre).toHaveBeenCalled();
      expect(userFactory.create).not.toHaveBeenCalled();
    });

    it('garde l’identifiant du compte d’origine', async () => {
      const { usecase } = makeUsecase(inachevee());

      const user = await usecase.execute(INPUT);

      expect(user.userId).toBe(7);
    });

    it('redeclare l’identité et le mot de passe de celui qui se présente', async () => {
      const { usecase, userFactory } = makeUsecase(inachevee());

      await usecase.execute(INPUT);

      expect(userFactory.reprendre).toHaveBeenCalledWith(
        expect.any(User),
        expect.objectContaining({
          firstname: INPUT.firstname,
          password: INPUT.password,
        }),
      );
    });

    it('annonce l’inscription, pour que le lien de vérification reparte', async () => {
      const { usecase, eventBus } = makeUsecase(inachevee());

      await usecase.execute(INPUT);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(UserRegisteredDomainEvent),
      );
    });
  });

  /**
   * La garde se resserre : elle refusait sur `isEmailVerified()`, si bien
   * qu'un compte non vérifié mais sanctionné passait au travers et partait
   * créer un doublon. Une inscription en chemin se reprend ; un compte qu'on a
   * fermé ou suspendu, non.
   */
  describe.each([
    ['suspendu', UserStatus.SUSPENDU],
    ['clos', UserStatus.CLOS],
    ['supprimé', UserStatus.SUPPRIME],
  ])('compte %s bien que non vérifié', (_libelle, status) => {
    it('refuse l’adresse, sans rien créer ni reprendre', async () => {
      const { usecase, userFactory, userRepository } = makeUsecase(
        buildUserFixture({ status, emailVerified: false }),
      );

      await expect(usecase.execute(INPUT)).rejects.toBeInstanceOf(
        EmailAlreadyRegisteredError,
      );
      expect(userFactory.create).not.toHaveBeenCalled();
      expect(userFactory.reprendre).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });
});
