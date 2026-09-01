import { LessThan } from 'typeorm';
import {
  DepotCleanupCronService,
  DELAI_ABANDON_DEPOT_JOURS,
  MOTIF_DEPOT_ABANDONNE,
} from './depot-cleanup-cron.service';
import {
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';

/**
 * Clôture des dépôts abandonnés. Le point sensible n'est pas ce que le cron
 * ferme, c'est ce qu'il NE DOIT PAS fermer : un dépôt récent encore en attente
 * de webhook, et surtout toute transaction qui n'est pas un dépôt.
 */
describe('DepotCleanupCronService', () => {
  let txRepo: any;
  let service: DepotCleanupCronService;

  beforeEach(() => {
    txRepo = { update: jest.fn().mockResolvedValue({ affected: 3 }) };
    service = new DepotCleanupCronService(txRepo);
  });

  it('ne vise QUE les dépôts INITIE antérieurs au délai, et les passe en ECHOUE « abandonne »', async () => {
    const maintenant = new Date('2026-08-31T00:00:00.000Z');

    const resultat = await service.run(maintenant);

    expect(resultat.nbClotures).toBe(3);
    expect(txRepo.update).toHaveBeenCalledTimes(1);

    const [critere, mutation] = txRepo.update.mock.calls[0];
    expect(critere.type).toBe(TransactionType.DEPOT);
    expect(critere.statut).toBe(TransactionStatus.INITIE);
    expect(mutation).toEqual({
      statut: TransactionStatus.ECHOUE,
      motifEchec: MOTIF_DEPOT_ABANDONNE,
    });

    // Borne temporelle : exactement 7 jours avant l'instant fourni.
    const attendu = new Date(
      maintenant.getTime() - DELAI_ABANDON_DEPOT_JOURS * 24 * 60 * 60 * 1000,
    );
    expect(critere.createdAt).toEqual(LessThan(attendu));
  });

  it('aucun solde n’est touché : la clôture est une simple requête de mise à jour', async () => {
    await service.run(new Date());

    // Un dépôt INITIE n'a jamais rien crédité — le fermer ne déplace pas un
    // euro. Le service ne connaît d'ailleurs aucun dépôt de portefeuille.
    expect(Object.keys(service as any)).not.toContain('walletRepo');
    expect(txRepo.update).toHaveBeenCalledTimes(1);
  });

  it('le cron absorbe une panne : il journalise et ne relance pas l’exception', async () => {
    txRepo.update.mockRejectedValue(new Error('base indisponible'));

    await expect(service.closeAbandonedDeposits()).resolves.toBeUndefined();
  });

  it('sans dépôt abandonné, la mise à jour reste sans effet et ne lève rien', async () => {
    txRepo.update.mockResolvedValue({ affected: 0 });

    await expect(service.closeAbandonedDeposits()).resolves.toBeUndefined();
    expect((await service.run()).nbClotures).toBe(0);
  });
});
