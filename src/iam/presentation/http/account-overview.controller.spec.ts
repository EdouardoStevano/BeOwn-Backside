import { AccountOverviewController } from 'src/iam/presentation/http/account-overview.controller';

/**
 * Ces deux tests vivaient dans `user.controller.spec.ts` ; ils suivent les
 * routes qui ont changé de module. Le contrat vérifié est inchangé : le
 * contrôleur route, il ne décide de rien.
 */
describe('AccountOverviewController', () => {
  const activeUser = {
    userId: 42,
    email: 'jean@example.com',
    role: 'investisseur',
  } as never;

  const monter = () => {
    const useCases = {
      getMyAccount: { execute: jest.fn().mockResolvedValue({ userId: 42 }) },
      getUserAccount: { execute: jest.fn().mockResolvedValue({ userId: 7 }) },
    };

    const controller = new AccountOverviewController(
      useCases.getMyAccount as never,
      useCases.getUserAccount as never,
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
});
