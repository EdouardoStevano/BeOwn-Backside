import { DeleteMyAccountUseCase } from './delete-my-account.usecase';
import type { HashingService } from 'src/common/hashing/hashing.service';
import {
  ConfirmationParMotDePasseImpossibleError,
  MotDePasseIncorrectError,
  UtilisateurIntrouvableError,
} from 'src/iam/domain/errors';
import { buildUser } from 'src/iam/domain/aggregates/user.fixture';
import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import type { DeleteAccountUseCase } from './delete-account.usecase';

const EMPREINTE = '$2b$10$empreinte-du-mot-de-passe';

function monter(compte = buildUser({ passwordHash: EMPREINTE })) {
  const mocks = {
    findByIdWithPassword: jest.fn().mockResolvedValue(compte),
    // Le vrai comparateur : l'empreinte reçue doit être celle du compte.
    compare: jest.fn((clair: string, empreinte: string) =>
      Promise.resolve(clair === 'bon-mdp' && empreinte === EMPREINTE),
    ),
    supprimer: jest.fn().mockResolvedValue(undefined),
  };

  const useCase = new DeleteMyAccountUseCase(
    {
      findByIdWithPassword: mocks.findByIdWithPassword,
    } as unknown as UserRepository,
    { compare: mocks.compare } as unknown as HashingService,
    { execute: mocks.supprimer } as unknown as DeleteAccountUseCase,
  );

  return { useCase, mocks };
}

describe('DeleteMyAccountUseCase', () => {
  it('supprime le compte quand le mot de passe est confirmé', async () => {
    // Le faux rend un **agrégat réel**, pas un objet nu : c'est précisément ce
    // qui manquait: le contrôleur lisait `(user as any).password`, undefined
    // sur un `User`, et refusait donc toutes les suppressions. Une spec qui
    // simule la persistance par `{ password: '…' }` ne peut pas le voir.
    const { useCase, mocks } = monter();

    await useCase.execute(42, 'bon-mdp');

    expect(mocks.compare).toHaveBeenCalledWith('bon-mdp', EMPREINTE);
    expect(mocks.supprimer).toHaveBeenCalledWith(42, {
      userId: 42,
      role: 'investisseur',
    });
  });

  it('charge le hash par findByIdWithPassword, jamais par findById', async () => {
    // `findById` laisse la colonne `select: false` à undefined : l'utiliser
    // casserait la confirmation pour tous les comptes.
    const { useCase, mocks } = monter();

    await useCase.execute(42, 'bon-mdp');

    expect(mocks.findByIdWithPassword).toHaveBeenCalledWith(42);
  });

  it('refuse un mot de passe incorrect sans rien supprimer', async () => {
    const { useCase, mocks } = monter();

    await expect(useCase.execute(42, 'mauvais-mdp')).rejects.toBeInstanceOf(
      MotDePasseIncorrectError,
    );
    expect(mocks.supprimer).not.toHaveBeenCalled();
  });

  it('conserve le code que le front intercepte', () => {
    // Sans `INVALID_PASSWORD`, l'intercepteur du front croit à une session
    // expirée, rafraîchit le token et rejoue la suppression.
    expect(new MotDePasseIncorrectError().code).toBe('INVALID_PASSWORD');
  });

  it("refuse la suppression d'un compte sans mot de passe", async () => {
    // Inscription par fournisseur social : il n'y a pas de preuve à demander.
    const { useCase, mocks } = monter(buildUser({ passwordHash: null }));

    await expect(useCase.execute(42, 'peu-importe')).rejects.toBeInstanceOf(
      ConfirmationParMotDePasseImpossibleError,
    );
    expect(mocks.supprimer).not.toHaveBeenCalled();
  });

  it('refuse un compte introuvable', async () => {
    const { useCase, mocks } = monter();
    mocks.findByIdWithPassword.mockResolvedValue(null);

    await expect(useCase.execute(42, 'bon-mdp')).rejects.toBeInstanceOf(
      UtilisateurIntrouvableError,
    );
    expect(mocks.supprimer).not.toHaveBeenCalled();
  });
});
