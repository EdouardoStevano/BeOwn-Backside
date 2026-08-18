import { ChangerTelephoneUseCase } from './changer-telephone.usecase';
import { InvalidTelephoneError } from 'src/iam/domains/errors/profile.errors';
import { buildUser } from 'src/iam/domains/models/user.fixture';
import type { User } from 'src/iam/domains/models/user';
import type { UserRepository } from 'src/iam/domains/ports/user.repository';

const UTILISATEUR = 42;

function monter(compte: User | null = buildUser({ userId: UTILISATEUR })) {
  const mocks = {
    findById: jest.fn().mockResolvedValue(compte),
    update: jest.fn((u: User) => Promise.resolve(u)),
  };

  return {
    useCase: new ChangerTelephoneUseCase(mocks as unknown as UserRepository),
    mocks,
    compte,
  };
}

describe('ChangerTelephoneUseCase', () => {
  it('enregistre le numéro sous sa forme normalisée', async () => {
    const { useCase, mocks, compte } = monter();

    await expect(useCase.execute(UTILISATEUR, '0033612345678')).resolves.toBe(
      true,
    );

    // Normalisé par le Value Object du compte, pas recopié tel quel.
    expect(compte?.telephone).toBe('+33612345678');
    expect(mocks.update).toHaveBeenCalledWith(compte);
  });

  it("n'écrit pas quand le numéro est déjà celui du compte", async () => {
    // Redéclarer le même numéro sous une autre mise en forme ne produit pas
    // d'écriture — donc pas de ligne d'historique inutile.
    const { useCase, mocks } = monter(
      buildUser({ userId: UTILISATEUR, telephone: '+33612345678' }),
    );

    await expect(
      useCase.execute(UTILISATEUR, '+33 6 12 34 56 78'),
    ).resolves.toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('efface le numéro sur un `null` explicite', async () => {
    const { useCase, compte } = monter(
      buildUser({ userId: UTILISATEUR, telephone: '+33612345678' }),
    );

    await useCase.execute(UTILISATEUR, null);

    expect(compte?.telephone).toBeNull();
  });

  it('refuse un numéro invalide sans écrire', async () => {
    const { useCase, mocks } = monter();

    await expect(useCase.execute(UTILISATEUR, '06')).rejects.toBeInstanceOf(
      InvalidTelephoneError,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reste sans effet quand le compte a disparu', async () => {
    const { useCase, mocks } = monter(null);

    await expect(useCase.execute(UTILISATEUR, '0612345678')).resolves.toBe(
      false,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
