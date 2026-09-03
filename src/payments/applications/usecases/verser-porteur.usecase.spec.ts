import { ConflictException, NotFoundException } from '@nestjs/common';
import { VerserPorteurUseCase } from './verser-porteur.usecase';
import { TransactionStatus, TransactionType } from 'src/wallets/domains/enums/wallet.enum';
import { KIND_VERSEMENT_PORTEUR } from 'src/wallets/applications/project-ledger.service';

const PROJET_ID = 'projet-1';
const PORTEUR_ID = 42;
const WALLET_PROJET = { id: 'w-projet', solde: 120_000, devise: 'EUR' };

function build(options: {
  soldeProjet?: number;
  porteurId?: number | null;
  payoutsEnabled?: boolean;
  transferJette?: Error;
  payoutJette?: Error;
  debitAffecte?: number;
  txExistante?: any;
  /** Fait échouer l'insertion de l'écriture (course sur la clé unique, panne). */
  insertJette?: Error;
} = {}) {
  const solde = options.soldeProjet ?? WALLET_PROJET.solde;
  const savedTx: any[] = [];
  let dernierMontantDebit = 0;

  const manager: any = {
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        update: () => qb,
        set: () => qb,
        setParameter: (cle: string, valeur: any) => {
          if (cle === 'montant') dernierMontantDebit = valeur;
          return qb;
        },
        where: () => qb,
        execute: async () => ({
          affected:
            options.debitAffecte !== undefined
              ? options.debitAffecte
              : dernierMontantDebit <= solde
                ? 1
                : 0,
        }),
      };
      return qb;
    }),
    create: jest.fn((_e: any, obj: any) => obj),
    save: jest.fn(async (obj: any) => {
      if (options.insertJette) throw options.insertJette;
      const tx = { id: 'tx-versement', ...obj };
      savedTx.push(tx);
      return tx;
    }),
  };

  const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(manager)) };
  const txRepo: any = {
    findOne: jest.fn().mockResolvedValue(options.txExistante ?? null),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const projectRepo: any = {
    findOne: jest.fn().mockResolvedValue(
      options.porteurId === null
        ? { id: PROJET_ID, porteurId: null }
        : { id: PROJET_ID, porteurId: options.porteurId ?? PORTEUR_ID },
    ),
  };
  const resolver: any = {
    executeInTransaction: jest
      .fn()
      .mockResolvedValue({ ...WALLET_PROJET, solde }),
  };
  const stripeConnect: any = {
    getAccountStatus: jest.fn().mockResolvedValue({
      connected: true,
      accountId: 'acct_porteur',
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: options.payoutsEnabled ?? true,
    }),
    createTransfer: options.transferJette
      ? jest.fn().mockRejectedValue(options.transferJette)
      : jest.fn().mockResolvedValue('tr_1'),
    createPayoutOnConnectedAccount: options.payoutJette
      ? jest.fn().mockRejectedValue(options.payoutJette)
      : jest.fn().mockResolvedValue('po_1'),
  };
  const requestRetrait: any = {
    recreditRetrait: jest.fn().mockResolvedValue('recredited'),
  };
  const notifications: any = {
    push: jest.fn().mockResolvedValue(undefined),
    pushToAdmins: jest.fn().mockResolvedValue(undefined),
  };
  const metrics: any = {
    incrementCounter: jest.fn(),
    observeHistogram: jest.fn(),
    setGauge: jest.fn(),
  };

  return {
    useCase: new VerserPorteurUseCase(
      dataSource,
      txRepo,
      projectRepo,
      resolver,
      stripeConnect,
      requestRetrait,
      notifications,
      metrics,
    ),
    savedTx,
    txRepo,
    stripeConnect,
    requestRetrait,
    notifications,
    metrics,
  };
}

const INPUT = { projetId: PROJET_ID, declareParUserId: 900 };

describe('VerserPorteurUseCase', () => {
  it('débite le projet puis achemine les fonds : transfert AVANT payout', async () => {
    const h = build();

    const res = await h.useCase.execute(INPUT);

    expect(res).toEqual(
      expect.objectContaining({
        success: true,
        transactionId: 'tx-versement',
        montant: 120_000,
        transferId: 'tr_1',
        payoutId: 'po_1',
      }),
    );
    expect(h.stripeConnect.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMajor: 120_000,
        destinationAccountId: 'acct_porteur',
        idempotencyKey: 'versement-transfer:tx-versement',
        metadata: expect.objectContaining({ retraitTxId: 'tx-versement' }),
      }),
    );
  });

  it('écrit un retrait EN_COURS portant les clés que lisent les webhooks payout', async () => {
    const h = build();
    await h.useCase.execute(INPUT);

    const tx = h.savedTx[0];
    expect(tx).toEqual(
      expect.objectContaining({
        walletSource: 'w-projet',
        walletDestination: null, // contrepartie externe : la banque du porteur
        type: TransactionType.RETRAIT,
        statut: TransactionStatus.EN_COURS,
        projetId: PROJET_ID,
      }),
    );
    // Sans ces trois clés, `payout.failed` ne saurait ni retrouver le
    // transfert à rapatrier, ni qui prévenir : le dénouement durci partagé
    // avec le retrait investisseur ne s'appliquerait pas.
    expect(tx.metadata).toEqual(
      expect.objectContaining({
        kind: KIND_VERSEMENT_PORTEUR,
        method: 'stripe_connect',
        connectedAccountId: 'acct_porteur',
        userId: PORTEUR_ID,
      }),
    );
  });

  it('verse tout le solde du projet quand aucun montant n’est précisé', async () => {
    const h = build({ soldeProjet: 87_500 });
    const res = await h.useCase.execute(INPUT);
    expect(res).toEqual(expect.objectContaining({ success: true, montant: 87_500 }));
  });

  it('refuse un montant que le portefeuille du projet ne couvre pas — sans appeler Stripe', async () => {
    const h = build({ soldeProjet: 1_000 });

    const res = await h.useCase.execute({ ...INPUT, montant: 5_000 });

    expect(res).toEqual(
      expect.objectContaining({ success: false, code: 'INSUFFICIENT_FUNDS' }),
    );
    expect(h.stripeConnect.createTransfer).not.toHaveBeenCalled();
  });

  it('refuse AVANT tout débit si le porteur n’a pas de compte de retrait actif', async () => {
    const h = build({ payoutsEnabled: false });

    await expect(h.useCase.execute(INPUT)).rejects.toBeInstanceOf(ConflictException);
    expect(h.savedTx).toEqual([]); // aucun débit, aucune écriture
  });

  it('refuse un projet sans porteur rattaché', async () => {
    const h = build({ porteurId: null });
    await expect(h.useCase.execute(INPUT)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuse un projet introuvable', async () => {
    const h = build();
    (h as any).useCase['projectRepo'].findOne = jest.fn().mockResolvedValue(null);
    await expect(h.useCase.execute(INPUT)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recrédite intégralement le projet si le transfert échoue', async () => {
    const h = build({ transferJette: new Error('Stripe indisponible') });

    const res = await h.useCase.execute(INPUT);

    expect(res).toEqual(
      expect.objectContaining({ success: false, code: 'TRANSFER_FAILED' }),
    );
    // Recrédit délégué à l'implémentation UNIQUE et idempotente, partagée
    // avec le retrait investisseur et les webhooks.
    expect(h.requestRetrait.recreditRetrait).toHaveBeenCalledWith(
      'tx-versement',
      expect.stringContaining('Stripe indisponible'),
      TransactionStatus.ECHOUE,
    );
  });

  it('ne rollback PAS quand seul le payout explicite est refusé : les fonds sont chez le porteur', async () => {
    // Un compte Express verse automatiquement. Le transfert a réussi — l'argent
    // est arrivé. Recréditer le projet le paierait deux fois.
    const h = build({ payoutJette: new Error('payouts are automatic') });

    const res = await h.useCase.execute(INPUT);

    expect(res).toEqual(expect.objectContaining({ success: true, transferId: 'tr_1' }));
    expect(h.requestRetrait.recreditRetrait).not.toHaveBeenCalled();
  });

  it('est idempotent sur la clé du back-office : une resoumission ne verse pas deux fois', async () => {
    const h = build({
      txExistante: {
        id: 'tx-deja',
        montant: 120_000,
        statut: TransactionStatus.EN_COURS,
        metadata: { transferId: 'tr_deja' },
        fournisseurRef: 'tr_deja',
      },
    });

    const res = await h.useCase.execute({ ...INPUT, idempotencyKey: 'cle-1' });

    expect(res).toEqual(
      expect.objectContaining({
        success: true,
        transactionId: 'tx-deja',
        alreadyProcessed: true,
      }),
    );
    expect(h.stripeConnect.createTransfer).not.toHaveBeenCalled();
  });

  it('idempotence SOUS CONCURRENCE : le perdant de la course sur la clé unique rend « déjà traité », pas une 500', async () => {
    // Deux soumissions simultanées de la même clé passent toutes deux le
    // pré-check (findOne → null). La seconde meurt sur la contrainte d'unicité
    // en base — son débit est annulé avec sa transaction — et doit rendre le
    // versement du gagnant, pas laisser fuir l'erreur SQL.
    const h = build({ insertJette: Object.assign(new Error('duplicate'), { code: '23505' }) });
    const gagnant = {
      id: 'tx-gagnant',
      montant: 120_000,
      statut: TransactionStatus.EN_COURS,
      metadata: { transferId: 'tr_gagnant' },
      fournisseurRef: 'tr_gagnant',
    };
    // Pré-check : rien. Relecture après la violation : le versement du gagnant.
    h.txRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(gagnant);

    const res = await h.useCase.execute({ ...INPUT, idempotencyKey: 'cle-course' });

    expect(res).toEqual(
      expect.objectContaining({
        success: true,
        transactionId: 'tx-gagnant',
        alreadyProcessed: true,
      }),
    );
    // Aucun euro n'a été acheminé par le perdant.
    expect(h.stripeConnect.createTransfer).not.toHaveBeenCalled();
  });

  it('une panne d’insertion qui n’est PAS un doublon remonte telle quelle', async () => {
    const h = build({ insertJette: new Error('connexion perdue') });

    await expect(
      h.useCase.execute({ ...INPUT, idempotencyKey: 'cle-x' }),
    ).rejects.toThrow('connexion perdue');
    expect(h.stripeConnect.createTransfer).not.toHaveBeenCalled();
  });
});
