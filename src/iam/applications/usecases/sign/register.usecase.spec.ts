import { Logger } from '@nestjs/common';
import { RegisterUseCase } from './register.usecase';
import { CGU_VERSION_PAR_DEFAUT } from 'src/iam/domains/cgu-version';
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

  /**
   * La version archivée est une PREUVE de consentement (art. 7.1 RGPD) : elle
   * venait du corps de requête, donc du client, qui pouvait déclarer avoir
   * accepté « 99.0 » ou un texte n'ayant jamais existé. Le serveur décide.
   */
  describe('version des CGU décidée par le SERVEUR', () => {
    const versionArchivee = (userFactory: { create: jest.Mock }) =>
      userFactory.create.mock.calls[0][0].cguAcceptation.version;

    it('archive la version en vigueur, pas celle envoyée par le client', async () => {
      const { usecase, userFactory } = makeUsecase();

      await usecase.execute({ ...INPUT, cguVersion: '99.0' } as any);

      expect(versionArchivee(userFactory)).toBe(CGU_VERSION_PAR_DEFAUT);
    });

    it("accepte une inscription SANS champ de version (le client n'en décide plus)", async () => {
      const { usecase, userFactory, userRepository } = makeUsecase();

      await usecase.execute({ ...INPUT, cguVersion: undefined } as any);

      expect(userRepository.save).toHaveBeenCalled();
      expect(versionArchivee(userFactory)).toBe(CGU_VERSION_PAR_DEFAUT);
    });

    it('suit CGU_VERSION_COURANTE quand elle est posée', async () => {
      const precedente = process.env.CGU_VERSION_COURANTE;
      process.env.CGU_VERSION_COURANTE = '2.0';
      try {
        const { usecase, userFactory } = makeUsecase();

        await usecase.execute(INPUT);

        expect(versionArchivee(userFactory)).toBe('2.0');
      } finally {
        if (precedente === undefined) delete process.env.CGU_VERSION_COURANTE;
        else process.env.CGU_VERSION_COURANTE = precedente;
      }
    });

    it('une divergence est SIGNALÉE, jamais rejetée (fronts en transition)', async () => {
      const avertir = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { usecase, userRepository } = makeUsecase();

      await usecase.execute({ ...INPUT, cguVersion: '0.9' } as any);

      expect(userRepository.save).toHaveBeenCalled();
      expect(avertir).toHaveBeenCalledWith(expect.stringContaining('0.9'));
      avertir.mockRestore();
    });

    it('aucun avertissement quand le client affiche la bonne version', async () => {
      const avertir = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { usecase } = makeUsecase();

      await usecase.execute({ ...INPUT, cguVersion: CGU_VERSION_PAR_DEFAUT });

      expect(avertir).not.toHaveBeenCalled();
      avertir.mockRestore();
    });
  });
});
