import { AcheminementDuRetraitService } from './acheminement-du-retrait.service';
import { Money } from 'src/treasury/domain/value-objects/money.vo';

function monter(
  etat: { transfertEchoue?: boolean; versementRefuse?: boolean } = {},
) {
  const connect = {
    statutDuCompte: jest.fn().mockResolvedValue({
      connected: true,
      accountId: 'acct_1',
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    }),
    transferer: etat.transfertEchoue
      ? jest.fn().mockRejectedValue(new Error('transfer refusé'))
      : jest.fn().mockResolvedValue('tr_1'),
    verser: etat.versementRefuse
      ? jest.fn().mockRejectedValue(new Error('payouts automatiques'))
      : jest.fn().mockResolvedValue('po_1'),
  };

  return {
    service: new AcheminementDuRetraitService(connect as never),
    connect,
  };
}

const demande = {
  mouvementId: 'tx-1',
  utilisateurId: 42,
  montant: Money.euros(100),
  compteConnecte: 'acct_1',
};

/**
 * Le service ne connaît ni portefeuille ni registre : il porte les fonds et
 * rend ce qu'il a déclenché. Ce que ces tests protègent est la **différence de
 * poids** entre ses deux appels — celle qu'on ne peut pas se permettre de
 * confondre sur de l'argent.
 */
describe('AcheminementDuRetraitService', () => {
  it('rend les deux références quand transfert et versement aboutissent', async () => {
    const { service } = monter();

    await expect(service.acheminer(demande)).resolves.toEqual({
      issue: 'achemine',
      transfertId: 'tr_1',
      versementId: 'po_1',
    });
  });

  it('signale un transfert refusé — rien n’a quitté la plateforme', async () => {
    const { service, connect } = monter({ transfertEchoue: true });

    await expect(service.acheminer(demande)).resolves.toMatchObject({
      issue: 'transfert-refuse',
      motif: 'transfer refusé',
    });
    // Le versement n'est même pas tenté : il n'y a rien à verser.
    expect(connect.verser).not.toHaveBeenCalled();
  });

  it('absorbe un versement refusé sans compromettre le retrait', async () => {
    // Le compte verse probablement de lui-même. Le transfert a réussi :
    // remonter un échec ici ferait rapatrier des fonds déjà en route.
    const { service } = monter({ versementRefuse: true });

    await expect(service.acheminer(demande)).resolves.toEqual({
      issue: 'achemine',
      transfertId: 'tr_1',
      versementId: undefined,
    });
  });

  it('dérive ses clés d’idempotence du mouvement', async () => {
    // Rejouer l'acheminement du même retrait ne doit créer ni second transfert
    // ni second versement chez le fournisseur.
    const { service, connect } = monter();

    await service.acheminer(demande);

    expect(connect.transferer).toHaveBeenCalledWith(
      expect.objectContaining({ cleDIdempotence: 'retrait-transfer:tx-1' }),
    );
    expect(connect.verser).toHaveBeenCalledWith(
      expect.objectContaining({ cleDIdempotence: 'retrait-payout:tx-1' }),
    );
  });

  it('se replie sur un compte non connecté quand le fournisseur est muet', async () => {
    // Jamais sur un compte présumé prêt : cela ferait partir un transfert vers
    // un compte dont on ignore l'état.
    const { service, connect } = monter();
    connect.statutDuCompte.mockRejectedValue(new Error('Stripe indisponible'));

    await expect(service.compteDeRetrait(42)).resolves.toMatchObject({
      connected: false,
      accountId: null,
      payoutsEnabled: false,
    });
  });
});
