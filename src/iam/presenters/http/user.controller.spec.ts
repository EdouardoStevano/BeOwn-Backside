import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserController } from 'src/iam/presenters/http/user.controller';

/**
 * Couvre le point sensible de DELETE /users/me : la confirmation du mot de
 * passe. Le hash de mot de passe vit sur une colonne `select: false`, donc la
 * vérification DOIT passer par findByIdWithPassword (findById laisse le hash à
 * undefined et casserait la suppression pour tous les comptes).
 */
describe('UserController.deleteMe', () => {
  let controller: UserController;
  let userRepository: any;
  let hashingService: any;
  let deleteAccountUseCase: any;

  const activeUser = {
    userId: 42,
    email: 'jean@example.com',
    role: 'investisseur',
  };

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      findByIdWithPassword: jest.fn(),
    };
    hashingService = { compare: jest.fn() };
    deleteAccountUseCase = { execute: jest.fn().mockResolvedValue(undefined) };

    controller = new UserController(
      userRepository,
      {} as any, // profilPPRepository
      {} as any, // profilPMRepository
      {} as any, // kycRepository
      {} as any, // documentRepository
      {} as any, // walletRepository
      hashingService,
      {} as any, // notificationEvents
      deleteAccountUseCase,
    );
  });

  it('charge le hash via findByIdWithPassword (pas findById) et délègue au usecase avec le bon mot de passe', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({
      userId: 42,
      password: '$2b$hash',
      role: 'investisseur',
    });
    hashingService.compare.mockResolvedValue(true);

    await controller.deleteMe(activeUser as any, { password: 'bon-mdp' });

    expect(userRepository.findByIdWithPassword).toHaveBeenCalledWith(42);
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(hashingService.compare).toHaveBeenCalledWith('bon-mdp', '$2b$hash');
    expect(deleteAccountUseCase.execute).toHaveBeenCalledWith(42, {
      userId: 42,
      role: 'investisseur',
    });
  });

  it('mauvais mot de passe → 401 avec code INVALID_PASSWORD, sans supprimer', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({
      userId: 42,
      password: '$2b$hash',
      role: 'investisseur',
    });
    hashingService.compare.mockResolvedValue(false);

    let caught: any;
    try {
      await controller.deleteMe(activeUser as any, { password: 'mauvais' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnauthorizedException);
    expect(caught.getResponse()).toMatchObject({ code: 'INVALID_PASSWORD' });
    expect(deleteAccountUseCase.execute).not.toHaveBeenCalled();
  });

  it('utilisateur introuvable → 404', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue(null);
    await expect(
      controller.deleteMe(activeUser as any, { password: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteAccountUseCase.execute).not.toHaveBeenCalled();
  });
});
