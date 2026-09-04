import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { buildUser } from 'src/iam/domains/models/user.fixture';
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
      {} as any, // profilRepository
      {} as any, // documentRepository
      {} as any, // walletRepository
      hashingService,
      {} as any, // notificationEvents
      deleteAccountUseCase,
    );
  });

  it('charge le hash via findByIdWithPassword (pas findById) et délègue au usecase avec le bon mot de passe', async () => {
    // Forme du modèle DOMAINE : le hash n'est accessible que par le getter
    // `passwordHash` (l'entité ORM garde `password`, mais elle ne sort jamais
    // du repository). Le mock reflète le contrat réel du domaine.
    userRepository.findByIdWithPassword.mockResolvedValue({
      userId: 42,
      passwordHash: '$2b$hash',
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
      passwordHash: '$2b$hash',
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

/**
 * Anomalie de validation (P0, S1) : `users.porteurAccess` n'apparaissait dans
 * AUCUNE réponse utilisateur. Un investisseur dont la demande venait d'être
 * acceptée n'avait aucun moyen de le savoir, et le front ne pouvait ni
 * afficher le sélecteur d'espace, ni assouplir ses gardes.
 *
 * Le drapeau reste HORS de l'agrégat `User` (ADR § 3) : il est lu par la
 * méthode de port dédiée et FOURNI à la projection, exactement comme le second
 * facteur.
 */
describe('UserController.getMe — accès porteur', () => {
  let controller: UserController;
  let userRepository: any;
  let profilRepository: any;
  let documentRepository: any;
  let walletRepository: any;

  const activeUser = { userId: 42, email: 'jean@example.com' };

  beforeEach(() => {
    userRepository = {
      findById: jest.fn().mockResolvedValue(buildUser({ userId: 42 })),
      findAccesPorteur: jest.fn(),
      findPreferences: jest.fn().mockResolvedValue(null),
    };
    profilRepository = {
      findProfilPPByUserId: jest.fn().mockResolvedValue(null),
      findProfilPMByUserId: jest.fn().mockResolvedValue(null),
      findKycByUserId: jest.fn().mockResolvedValue(null),
    };
    documentRepository = { findByUserId: jest.fn().mockResolvedValue([]) };
    walletRepository = { findWalletByUser: jest.fn().mockResolvedValue(null) };

    controller = new UserController(
      userRepository,
      profilRepository,
      documentRepository,
      walletRepository,
      {} as any, // hashingService
      {} as any, // notificationEvents
      {} as any, // deleteAccountUseCase
    );
  });

  it("expose l'accès OUVERT d'un investisseur accepté", async () => {
    userRepository.findAccesPorteur.mockResolvedValue({
      role: UserRole.INVESTISSEUR,
      porteurAccess: true,
      accesRevoqueLe: null,
    });

    const reponse = await controller.getMe(activeUser as any);

    expect(userRepository.findAccesPorteur).toHaveBeenCalledWith(42);
    expect(reponse.accesPorteur).toEqual({
      porteurAccess: true,
      espacePorteurOuvert: true,
    });
  });

  it("expose l'accès FERMÉ d'un investisseur sans le drapeau", async () => {
    userRepository.findAccesPorteur.mockResolvedValue({
      role: UserRole.INVESTISSEUR,
      porteurAccess: false,
      accesRevoqueLe: null,
    });

    const reponse = await controller.getMe(activeUser as any);

    expect(reponse.accesPorteur).toEqual({
      porteurAccess: false,
      espacePorteurOuvert: false,
    });
  });

  it("ouvre l'espace d'un porteur « pur », dont le drapeau vaut pourtant false", async () => {
    // Contre-épreuve : un front qui lirait `porteurAccess` seul masquerait
    // l'espace porteur de tous les comptes porteurs seed.
    userRepository.findAccesPorteur.mockResolvedValue({
      role: UserRole.PORTEUR,
      porteurAccess: false,
      accesRevoqueLe: null,
    });

    const reponse = await controller.getMe(activeUser as any);

    expect(reponse.accesPorteur).toEqual({
      porteurAccess: false,
      espacePorteurOuvert: true,
    });
  });

  it("une lecture en échec ferme l'accès plutôt que de l'omettre", async () => {
    // L'absence d'information ne vaut jamais permission — et surtout, la clé
    // reste présente : un front qui la trouve absente ne saurait pas conclure.
    userRepository.findAccesPorteur.mockRejectedValue(new Error('base HS'));

    const reponse = await controller.getMe(activeUser as any);

    expect(reponse.accesPorteur).toEqual({
      porteurAccess: false,
      espacePorteurOuvert: false,
    });
  });

  it('ne prétend RIEN sur le second facteur (clé mfa absente)', async () => {
    // `getMe` ne charge pas le référentiel des facteurs : absent veut dire
    // « on n'en sait rien ici », et non « aucun facteur ».
    userRepository.findAccesPorteur.mockResolvedValue({
      role: UserRole.INVESTISSEUR,
      porteurAccess: true,
      accesRevoqueLe: null,
    });

    const reponse = await controller.getMe(activeUser as any);
    expect(reponse).not.toHaveProperty('mfa');
  });
});
