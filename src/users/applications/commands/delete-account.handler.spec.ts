import { DeleteAccountHandler } from './delete-account.handler';
import { DeleteAccountCommand } from './delete-account.command';
import {
  NoPasswordSetError,
  PasswordConfirmationFailedError,
  UserNotFoundError,
} from 'src/users/domains/errors/user.errors';

/**
 * Couvre le point sensible de DELETE /users/me : la confirmation du mot de
 * passe. Le hash vit sur une colonne `select: false`, donc la vérification DOIT
 * passer par findByIdWithPassword — findById laisse le hash à undefined et
 * casserait la suppression pour tous les comptes.
 */
describe('DeleteAccountHandler', () => {
  let handler: DeleteAccountHandler;
  let userRepository: {
    findById: jest.Mock;
    findByIdWithPassword: jest.Mock;
  };
  let hashingService: { compare: jest.Mock };
  let deleteAccount: { execute: jest.Mock };

  const utilisateur = (password: string | null = '$2b$hash') => ({
    userId: 42,
    role: 'investisseur',
    password,
    hasPassword: password !== null,
  });

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      findByIdWithPassword: jest.fn(),
    };
    hashingService = { compare: jest.fn() };
    deleteAccount = { execute: jest.fn().mockResolvedValue(undefined) };

    handler = new DeleteAccountHandler(
      userRepository as never,
      hashingService as never,
      deleteAccount as never,
    );
  });

  it('charge le hash via findByIdWithPassword, puis délègue au usecase', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue(utilisateur());
    hashingService.compare.mockResolvedValue(true);

    await handler.execute(new DeleteAccountCommand(42, 'bon-mdp'));

    expect(userRepository.findByIdWithPassword).toHaveBeenCalledWith(42);
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(hashingService.compare).toHaveBeenCalledWith('bon-mdp', '$2b$hash');
    expect(deleteAccount.execute).toHaveBeenCalledWith(42, {
      userId: 42,
      role: 'investisseur',
    });
  });

  it('mauvais mot de passe : refus, et rien de supprimé', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue(utilisateur());
    hashingService.compare.mockResolvedValue(false);

    await expect(
      handler.execute(new DeleteAccountCommand(42, 'mauvais')),
    ).rejects.toBeInstanceOf(PasswordConfirmationFailedError);
    expect(deleteAccount.execute).not.toHaveBeenCalled();
  });

  it('compte sans mot de passe (créé via OAuth) : confirmation impossible', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue(utilisateur(null));

    await expect(
      handler.execute(new DeleteAccountCommand(42, 'x')),
    ).rejects.toBeInstanceOf(NoPasswordSetError);
    expect(deleteAccount.execute).not.toHaveBeenCalled();
  });

  it('utilisateur introuvable', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue(null);

    await expect(
      handler.execute(new DeleteAccountCommand(42, 'x')),
    ).rejects.toBeInstanceOf(UserNotFoundError);
    expect(deleteAccount.execute).not.toHaveBeenCalled();
  });
});
