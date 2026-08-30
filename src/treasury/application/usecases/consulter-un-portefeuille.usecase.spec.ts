import { ConsulterUnPortefeuilleUseCase } from './consulter-un-portefeuille.usecase';
import { Wallet } from 'src/treasury/domain/aggregates/wallet';
import {
  AccesWalletRefuseError,
  WalletIntrouvableError,
} from 'src/treasury/domain/errors/treasury.errors';
import {
  backOffice,
  portefeuille,
  tiers,
  titulaire,
} from './__fixtures__/portefeuille.fixtures';

function monter(etat: { wallet?: Wallet | null } = {}) {
  const wallets = {
    findById: jest
      .fn()
      .mockResolvedValue(
        etat.wallet === undefined ? portefeuille() : etat.wallet,
      ),
  };

  return { useCase: new ConsulterUnPortefeuilleUseCase(wallets as never) };
}

describe('ConsulterUnPortefeuilleUseCase', () => {
  it('laisse le titulaire consulter le sien', async () => {
    const { useCase } = monter();

    await expect(useCase.execute('w-1', titulaire)).resolves.toMatchObject({
      id: 'w-1',
    });
  });

  it('refuse un tiers sans habilitation', async () => {
    const { useCase } = monter();

    await expect(useCase.execute('w-1', tiers)).rejects.toBeInstanceOf(
      AccesWalletRefuseError,
    );
  });

  it('laisse le back-office consulter le portefeuille d’autrui', async () => {
    const { useCase } = monter();

    await expect(useCase.execute('w-1', backOffice)).resolves.toBeDefined();
  });

  it('rend « introuvable » un portefeuille qui n’existe pas', async () => {
    const { useCase } = monter({ wallet: null });

    await expect(
      useCase.execute('w-inconnu', backOffice),
    ).rejects.toBeInstanceOf(WalletIntrouvableError);
  });

  it('un portefeuille de plateforme n’appartient à personne', async () => {
    // Seule l'habilitation l'ouvre, et c'est voulu.
    const { useCase } = monter({ wallet: portefeuille(null) });

    await expect(useCase.execute('w-1', titulaire)).rejects.toBeInstanceOf(
      AccesWalletRefuseError,
    );
    await expect(useCase.execute('w-1', backOffice)).resolves.toBeDefined();
  });
});
