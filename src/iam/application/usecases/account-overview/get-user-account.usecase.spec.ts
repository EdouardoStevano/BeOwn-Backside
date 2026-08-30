import { GetUserAccountUseCase } from './get-user-account.usecase';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import {
  AccesCompteRefuseError,
  UtilisateurIntrouvableError,
} from 'src/iam/domain/errors';
import { buildUser } from 'src/iam/domain/aggregates/user.fixture';
import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import type { DossierKycQuery } from 'src/onboarding/application/ports/dossier-kyc.query';
import type { WalletRepository } from 'src/treasury/domain/repositories/wallet.repository';

const CIBLE = 7;
const APPELANT = 42;

function monter(roleAppelant: UserRole = UserRole.INVESTISSEUR) {
  const comptes = new Map([
    [CIBLE, buildUser({ userId: CIBLE })],
    [APPELANT, buildUser({ userId: APPELANT, role: roleAppelant })],
  ]);

  const mocks = {
    findById: jest.fn((id: number) => Promise.resolve(comptes.get(id) ?? null)),
    findKyc: jest.fn().mockResolvedValue(null),
    findWallet: jest.fn().mockResolvedValue(null),
  };

  const useCase = new GetUserAccountUseCase(
    { findById: mocks.findById } as unknown as UserRepository,
    { parTitulaire: mocks.findKyc } as unknown as DossierKycQuery,
    { findByUser: mocks.findWallet } as unknown as WalletRepository,
  );

  return { useCase, mocks };
}

describe('GetUserAccountUseCase', () => {
  it('laisse chacun lire son propre compte', async () => {
    const { useCase, mocks } = monter();

    const compte = await useCase.execute(APPELANT, APPELANT);

    expect(compte.userId).toBe(APPELANT);
    // Aucune relecture de rôle : lire son compte ne demande aucun droit.
    expect(mocks.findById).toHaveBeenCalledTimes(1);
  });

  it("refuse la lecture d'un compte tiers à un investisseur", async () => {
    const { useCase, mocks } = monter(UserRole.INVESTISSEUR);

    await expect(useCase.execute(CIBLE, APPELANT)).rejects.toBeInstanceOf(
      AccesCompteRefuseError,
    );
    expect(mocks.findKyc).not.toHaveBeenCalled();
  });

  it("l'autorise à qui détient users:read", async () => {
    const { useCase } = monter(UserRole.SUPER_ADMIN);

    const compte = await useCase.execute(CIBLE, APPELANT);

    expect(compte.userId).toBe(CIBLE);
  });

  it('relit le rôle en base plutôt que de croire le token', async () => {
    // Une rétrogradation doit s'appliquer sans attendre l'expiration de la
    // session : c'est le compte en base qui décide, pas le jeton présenté.
    const { useCase, mocks } = monter(UserRole.SUPER_ADMIN);

    await useCase.execute(CIBLE, APPELANT);

    expect(mocks.findById).toHaveBeenCalledWith(APPELANT);
  });

  it('refuse un compte cible inexistant', async () => {
    const { useCase } = monter(UserRole.SUPER_ADMIN);

    await expect(useCase.execute(999, APPELANT)).rejects.toBeInstanceOf(
      UtilisateurIntrouvableError,
    );
  });

  it('rend le compte même si le KYC ou le wallet est indisponible', async () => {
    const { useCase, mocks } = monter();
    mocks.findKyc.mockRejectedValue(new Error('base HS'));
    mocks.findWallet.mockRejectedValue(new Error('base HS'));

    await expect(useCase.execute(APPELANT, APPELANT)).resolves.toMatchObject({
      kyc: null,
      wallet: null,
    });
  });
});
