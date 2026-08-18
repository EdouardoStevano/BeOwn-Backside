import { GetUserAccountUseCase } from './get-user-account.usecase';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import {
  AccesCompteRefuseError,
  UtilisateurIntrouvableError,
} from 'src/iam/domains/errors';
import { buildUser } from 'src/iam/domains/models/user.fixture';
import type { UserRepository } from 'src/iam/domains/ports/user.repository';
import type { KycRepository } from 'src/profiles/domains/ports/kyc.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';

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
    { findByUserId: mocks.findKyc } as unknown as KycRepository,
    { findWalletByUser: mocks.findWallet } as unknown as WalletRepository,
  );

  return { useCase, mocks };
}

describe('GetUserAccountUseCase', () => {
  it('publie le numéro de rappel du titulaire', async () => {
    // Le compte le porte depuis qu'il a quitté `profil_pp` : c'est cette
    // lecture-ci qui doit le rendre, plus le dossier investisseur.
    const { useCase } = monter();

    const compte = await useCase.execute(APPELANT, APPELANT);

    expect(compte).toHaveProperty('telephone');
  });

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
