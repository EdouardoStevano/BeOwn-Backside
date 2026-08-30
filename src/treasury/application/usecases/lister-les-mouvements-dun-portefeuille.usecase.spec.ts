import { ListerLesMouvementsDunPortefeuilleUseCase } from './lister-les-mouvements-dun-portefeuille.usecase';
import { ConsulterUnPortefeuilleUseCase } from './consulter-un-portefeuille.usecase';
import { Wallet } from 'src/treasury/domain/aggregates/wallet';
import { AccesWalletRefuseError } from 'src/treasury/domain/errors/treasury.errors';
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
  const registre = { findByWallet: jest.fn().mockResolvedValue([]) };

  // Le use case de consultation est monté **pour de vrai** : c'est lui qui
  // porte la garde, et le doubler reviendrait à ne plus l'éprouver.
  const useCase = new ListerLesMouvementsDunPortefeuilleUseCase(
    new ConsulterUnPortefeuilleUseCase(wallets as never),
    registre as never,
  );

  return { useCase, registre };
}

describe('ListerLesMouvementsDunPortefeuilleUseCase', () => {
  it('sert le relevé au titulaire du portefeuille', async () => {
    const { useCase, registre } = monter();

    await expect(useCase.execute('w-1', titulaire)).resolves.toEqual([]);
    expect(registre.findByWallet).toHaveBeenCalledWith('w-1');
  });

  it('protège le relevé comme le solde : il en révèle autant', async () => {
    const { useCase, registre } = monter();

    await expect(useCase.execute('w-1', tiers)).rejects.toBeInstanceOf(
      AccesWalletRefuseError,
    );
    expect(registre.findByWallet).not.toHaveBeenCalled();
  });

  it('laisse le back-office lire le relevé d’autrui', async () => {
    const { useCase } = monter();

    await expect(useCase.execute('w-1', backOffice)).resolves.toEqual([]);
  });
});
