import { ConsulterLePortefeuilleDunTitulaireUseCase } from './consulter-le-portefeuille-dun-titulaire.usecase';
import { Wallet } from 'src/treasury/domain/aggregates/wallet';
import {
  AccesWalletRefuseError,
  WalletIntrouvableError,
} from 'src/treasury/domain/errors/treasury.errors';
import {
  TITULAIRE,
  backOffice,
  portefeuille,
  tiers,
  titulaire,
} from './__fixtures__/portefeuille.fixtures';

function monter(etat: { wallet?: Wallet | null } = {}) {
  const wallets = {
    findByUser: jest
      .fn()
      .mockResolvedValue(
        etat.wallet === undefined ? portefeuille() : etat.wallet,
      ),
    creer: jest.fn().mockResolvedValue(portefeuille()),
  };

  return {
    useCase: new ConsulterLePortefeuilleDunTitulaireUseCase(wallets as never),
    wallets,
  };
}

describe('ConsulterLePortefeuilleDunTitulaireUseCase — ouverture à la première visite', () => {
  it('ouvre son portefeuille au titulaire qui n’en a pas encore', async () => {
    // Il ne devrait jamais lire « introuvable » sur son propre solde.
    const { useCase, wallets } = monter({ wallet: null });

    await expect(useCase.execute(TITULAIRE, titulaire)).resolves.toBeDefined();
    expect(wallets.creer).toHaveBeenCalled();
  });

  it('n’ouvre rien quand c’est le back-office qui regarde', async () => {
    // Un portefeuille est un objet comptable : le faire naître au gré des
    // écrans d'administration parcourus créerait des soldes à zéro que
    // personne n'a demandés.
    const { useCase, wallets } = monter({ wallet: null });

    await expect(useCase.execute(TITULAIRE, backOffice)).rejects.toBeInstanceOf(
      WalletIntrouvableError,
    );
    expect(wallets.creer).not.toHaveBeenCalled();
  });

  it('n’ouvre pas un second portefeuille quand il en existe un', async () => {
    const { useCase, wallets } = monter();

    await useCase.execute(TITULAIRE, titulaire);

    expect(wallets.creer).not.toHaveBeenCalled();
  });
});

describe('ConsulterLePortefeuilleDunTitulaireUseCase — accès', () => {
  it('refuse un tiers sans habilitation avant même de lire', async () => {
    // La garde se pose **avant** de savoir si un portefeuille existe : on
    // n'interroge pas un objet qui n'est peut-être pas né.
    const { useCase, wallets } = monter();

    await expect(useCase.execute(TITULAIRE, tiers)).rejects.toBeInstanceOf(
      AccesWalletRefuseError,
    );
    expect(wallets.findByUser).not.toHaveBeenCalled();
  });

  it('laisse le back-office lire le portefeuille existant d’un titulaire', async () => {
    const { useCase } = monter();

    await expect(useCase.execute(TITULAIRE, backOffice)).resolves.toBeDefined();
  });
});
