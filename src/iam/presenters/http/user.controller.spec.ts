import { UserController } from 'src/iam/presenters/http/user.controller';
import { UserType } from 'src/iam/domains/enums/user.enum';
import { buildUser } from 'src/iam/domains/models/user.fixture';

/**
 * Le contrôleur ne fait plus que router : ces tests vérifient qu'il passe les
 * bons arguments au bon use case, et rien d'autre.
 *
 * Ce qu'il portait — confirmation du mot de passe, contrôle de rôle relu en
 * base, composition du profil complet — est éprouvé là où il vit désormais :
 * `delete-my-account.usecase.spec.ts`, `get-user-account.usecase.spec.ts`,
 * `get-onboarding-status.usecase.spec.ts`.
 */
describe('UserController', () => {
  const activeUser = {
    userId: 42,
    email: 'jean@example.com',
    role: 'investisseur',
  } as never;

  const monter = () => {
    const useCases = {
      getMyAccount: { execute: jest.fn().mockResolvedValue({ userId: 42 }) },
      getUserAccount: { execute: jest.fn().mockResolvedValue({ userId: 7 }) },
      updateMyAccount: { execute: jest.fn().mockResolvedValue(buildUser()) },
      declareUserType: { execute: jest.fn().mockResolvedValue(buildUser()) },
      updateUserByAdmin: { execute: jest.fn().mockResolvedValue(buildUser()) },
      deleteMyAccount: { execute: jest.fn().mockResolvedValue(undefined) },
    };

    const controller = new UserController(
      useCases.getMyAccount as never,
      useCases.getUserAccount as never,
      useCases.updateMyAccount as never,
      useCases.declareUserType as never,
      useCases.updateUserByAdmin as never,
      useCases.deleteMyAccount as never,
    );

    return { controller, useCases };
  };

  it('rend le compte du porteur du token, jamais celui du corps de requête', async () => {
    const { controller, useCases } = monter();

    await controller.getMe(activeUser);

    expect(useCases.getMyAccount.execute).toHaveBeenCalledWith(42);
  });

  it("transmet l'identité de l'appelant pour la lecture d'un compte tiers", async () => {
    // Le use case en a besoin : c'est lui qui relit le rôle et décide.
    const { controller, useCases } = monter();

    await controller.findOne(7, activeUser);

    expect(useCases.getUserAccount.execute).toHaveBeenCalledWith(7, 42);
  });

  it('transmet le type déclaré', async () => {
    const { controller, useCases } = monter();

    await controller.setUserType(activeUser, { userType: UserType.PM });

    expect(useCases.declareUserType.execute).toHaveBeenCalledWith(
      42,
      UserType.PM,
    );
  });

  it("transmet l'auteur de la modification administrative", async () => {
    const { controller, useCases } = monter();

    await controller.updateById(7, activeUser, { firstname: 'Awa' });

    expect(useCases.updateUserByAdmin.execute).toHaveBeenCalledWith(
      7,
      { firstname: 'Awa' },
      42,
    );
  });

  it('ne fait pas transiter le mot de passe au-delà du use case', async () => {
    const { controller, useCases } = monter();

    const reponse = await controller.deleteMe(activeUser, {
      password: 'bon-mdp',
    });

    expect(useCases.deleteMyAccount.execute).toHaveBeenCalledWith(
      42,
      'bon-mdp',
    );
    // 204 : le corps est vide, la suppression ne rend rien.
    expect(reponse).toBeUndefined();
  });
});
