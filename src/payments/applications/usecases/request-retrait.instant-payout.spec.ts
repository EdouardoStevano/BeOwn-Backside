import { RequestRetraitUseCase } from './request-retrait.usecase';
import { PayoutDestinationResolver } from '../services/payout-destination.resolver';
import { InMemoryPayoutMethodsAdapter } from '../../infrastructure/in-memory-payout-methods.adapter';
import { PayoutMethodError } from '../ports/payout-methods.port';
import {
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';

/**
 * Lot 4a — retrait vers une destination CHOISIE (carte / virement instantané).
 *
 * Invariants de sécurité argent vérifiés sans clé Stripe (appels mockés) :
 *  - la validation de la destination a lieu AVANT tout débit du wallet ;
 *  - le payout porte bien `method` et `destination` ;
 *  - un payout refusé APRÈS un transfer réussi déclenche reversal PUIS recrédit ;
 *  - si le reversal échoue, AUCUN recrédit à l'aveugle (escalade admin) ;
 *  - le parcours historique (sans payoutMethodId ni method) est inchangé.
 */
describe('RequestRetraitUseCase — versement vers une destination choisie', () => {
  const ACCOUNT = 'acct_1';
  const user = { userId: 42, email: 'a@b.c', role: 'INVESTISSEUR' } as any;

  let usecase: RequestRetraitUseCase;
  let adapter: InMemoryPayoutMethodsAdapter;
  let stripeConnect: any;
  let notificationService: any;
  let txRepo: any;
  let dataSource: any;
  let metrics: any;
  let openManager: any;
  let recreditManager: any;
  let txRow: any;

  const chainableQB = (result: any) => {
    const qb: any = {};
    qb.update = jest.fn(() => qb);
    qb.set = jest.fn(() => qb);
    qb.setParameter = jest.fn(() => qb);
    qb.where = jest.fn(() => qb);
    qb.execute = jest.fn().mockResolvedValue(result);
    return qb;
  };

  const seedCard = (
    id: string,
    over: Partial<{ isDefault: boolean; instantEligible: boolean }> = {},
  ) =>
    adapter.seed(ACCOUNT, {
      id,
      type: 'card',
      brand: 'visa',
      last4: '5556',
      expMonth: 12,
      expYear: 2030,
      isDefault: over.isDefault ?? true,
      instantEligible: over.instantEligible ?? true,
      currency: 'EUR',
      country: 'FR',
    });

  beforeEach(() => {
    adapter = new InMemoryPayoutMethodsAdapter();
    stripeConnect = {
      getAccountStatus: jest.fn().mockResolvedValue({
        connected: true,
        accountId: ACCOUNT,
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
      }),
      createTransfer: jest.fn().mockResolvedValue('tr_1'),
      createPayoutOnConnectedAccount: jest.fn().mockResolvedValue('po_1'),
      reverseTransfer: jest.fn().mockResolvedValue(undefined),
    };
    notificationService = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    txRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(async (x: any) => x),
    };
    metrics = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };

    txRow = {
      id: 'tx1',
      type: TransactionType.RETRAIT,
      statut: TransactionStatus.EN_COURS,
      montant: 100,
      walletSource: 'w1',
      metadata: { userId: 42 },
    };
    openManager = {
      findOne: jest.fn().mockResolvedValue({ id: 'w1', solde: 500, devise: 'EUR' }),
      createQueryBuilder: jest.fn(() => chainableQB({ affected: 1 })),
      create: jest.fn((_e: any, x: any) => x),
      save: jest.fn(async (x: any) => ({ ...x, id: 'tx1' })),
    };
    recreditManager = {
      findOne: jest.fn().mockResolvedValue(txRow),
      createQueryBuilder: jest.fn(() => chainableQB({ affected: 1 })),
      save: jest.fn(async (x: any) => x),
    };
    dataSource = { transaction: jest.fn() };

    usecase = new RequestRetraitUseCase(
      txRepo,
      stripeConnect,
      notificationService,
      dataSource,
      metrics,
      new PayoutDestinationResolver(adapter),
      /* amlMonitor */ { check: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  const givenOpenThenRecredit = () =>
    dataSource.transaction
      .mockImplementationOnce(async (cb: any) => cb(openManager))
      .mockImplementationOnce(async (cb: any) => cb(recreditManager));

  // ─── Chemin nominal ────────────────────────────────────────────────────────

  it('nominal : payout créé avec method=instant et destination=<carte>', async () => {
    seedCard('card_ok');
    dataSource.transaction.mockImplementationOnce(async (cb: any) => cb(openManager));

    const res = await usecase.execute(
      { amount: 100, currency: 'EUR', payoutMethodId: 'card_ok', method: 'instant' } as any,
      user,
    );

    expect(res).toEqual(
      expect.objectContaining({
        success: true,
        transactionId: 'tx1',
        payoutMethodId: 'card_ok',
        payoutMethod: 'instant',
      }),
    );
    expect(stripeConnect.createPayoutOnConnectedAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'instant',
        destination: 'card_ok',
        connectedAccountId: ACCOUNT,
        idempotencyKey: 'retrait-payout:tx1',
      }),
    );
  });

  it('nominal : la destination choisie est tracée dans les metadata du retrait', async () => {
    seedCard('card_ok');
    dataSource.transaction.mockImplementationOnce(async (cb: any) => cb(openManager));

    await usecase.execute(
      { amount: 100, currency: 'EUR', payoutMethodId: 'card_ok', method: 'instant' } as any,
      user,
    );

    expect(openManager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          payoutMethodId: 'card_ok',
          payoutMethod: 'instant',
        }),
      }),
    );
  });

  // ─── Rétrocompatibilité ────────────────────────────────────────────────────

  it('rétrocompatible : sans payoutMethodId ni method, le payout ne porte ni l\'un ni l\'autre', async () => {
    dataSource.transaction.mockImplementationOnce(async (cb: any) => cb(openManager));

    const res = await usecase.execute({ amount: 100, currency: 'EUR' } as any, user);

    expect(res).toEqual(expect.objectContaining({ success: true }));
    const payoutParams = stripeConnect.createPayoutOnConnectedAccount.mock.calls[0][0];
    expect(payoutParams).not.toHaveProperty('method');
    expect(payoutParams).not.toHaveProperty('destination');
  });

  it('rétrocompatible : un payout refusé sans destination choisie ne déclenche PAS de rollback', async () => {
    dataSource.transaction.mockImplementationOnce(async (cb: any) => cb(openManager));
    stripeConnect.createPayoutOnConnectedAccount.mockRejectedValue(
      new Error('payouts are automatic'),
    );

    const res = await usecase.execute({ amount: 100, currency: 'EUR' } as any, user);

    // Comportement d'origine : le transfert a réussi, on se repose sur le
    // payout automatique du compte Express.
    expect(res).toEqual(expect.objectContaining({ success: true }));
    expect(stripeConnect.reverseTransfer).not.toHaveBeenCalled();
  });

  // ─── Validation avant débit ────────────────────────────────────────────────

  it.each([
    [
      'NO_PAYOUT_METHOD',
      { amount: 100, currency: 'EUR', payoutMethodId: 'card_du_tiers', method: 'instant' },
    ],
    [
      'CARD_NOT_INSTANT_ELIGIBLE',
      { amount: 100, currency: 'EUR', payoutMethodId: 'card_std', method: 'instant' },
    ],
    [
      'AMOUNT_OUT_OF_RANGE',
      { amount: 50_000, currency: 'EUR', payoutMethodId: 'card_ok', method: 'instant' },
    ],
  ])('%s : AUCUN débit wallet, aucun appel Stripe argent', async (code, dto) => {
    seedCard('card_ok', { instantEligible: true });
    seedCard('card_std', { isDefault: false, instantEligible: false });

    const error = await usecase.execute(dto as any, user).catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe(code);
    // Invariant central : rien n'a été débité ni transféré.
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(stripeConnect.createTransfer).not.toHaveBeenCalled();
    expect(stripeConnect.createPayoutOnConnectedAccount).not.toHaveBeenCalled();
  });

  // ─── Rollback du payout instantané refusé ──────────────────────────────────

  it('payout instantané refusé après transfer réussi : reversal PUIS recrédit, CARD_REJECTED', async () => {
    seedCard('card_ok');
    givenOpenThenRecredit();
    stripeConnect.createPayoutOnConnectedAccount.mockRejectedValue(
      Object.assign(new Error('Your card was declined.'), { code: 'card_declined' }),
    );

    const res = await usecase.execute(
      { amount: 100, currency: 'EUR', payoutMethodId: 'card_ok', method: 'instant' } as any,
      user,
    );

    expect(res).toEqual(
      expect.objectContaining({ success: false, code: 'CARD_REJECTED' }),
    );
    // Fonds rapatriés avant recrédit, avec une clé idempotente stable.
    expect(stripeConnect.reverseTransfer).toHaveBeenCalledWith('tr_1', 'retrait-reverse:tx1');
    // Wallet recrédité + retrait marqué ECHOUE.
    expect(recreditManager.createQueryBuilder).toHaveBeenCalled();
    expect(txRow.statut).toBe(TransactionStatus.ECHOUE);
    expect(txRow.metadata.recredited).toBe(true);
    // Investisseur notifié.
    expect(notificationService.push).toHaveBeenCalled();
  });

  it('rollback : le message rendu au client ne contient aucun détail technique Stripe', async () => {
    seedCard('card_ok');
    givenOpenThenRecredit();
    stripeConnect.createPayoutOnConnectedAccount.mockRejectedValue(
      new Error('Your card was declined. (request req_abc123)'),
    );

    const res: any = await usecase.execute(
      { amount: 100, currency: 'EUR', payoutMethodId: 'card_ok', method: 'instant' } as any,
      user,
    );

    expect(res.message).not.toMatch(/req_abc123/);
    expect(res.message).not.toMatch(/declined/i);
    expect(res.message).toMatch(/recrédité/);
  });

  it('rollback impossible (reversal échoué) : AUCUN recrédit, escalade admin', async () => {
    seedCard('card_ok');
    dataSource.transaction.mockImplementation(async (cb: any) => cb(openManager));
    stripeConnect.createPayoutOnConnectedAccount.mockRejectedValue(
      new Error('Your card was declined.'),
    );
    stripeConnect.reverseTransfer.mockRejectedValue(new Error('reversal refused'));

    const res = await usecase.execute(
      { amount: 100, currency: 'EUR', payoutMethodId: 'card_ok', method: 'instant' } as any,
      user,
    );

    expect(res).toEqual(
      expect.objectContaining({ success: false, code: 'PAYOUT_FAILED' }),
    );
    // Le retrait reste EN_COURS : pas de recrédit tant que les fonds sont
    // encore sur le compte connecté.
    expect(txRow.statut).toBe(TransactionStatus.EN_COURS);
    expect(txRow.metadata.recredited).toBeUndefined();
    expect(notificationService.pushToAdmins).toHaveBeenCalled();
  });

  it('recrédit du rollback IDEMPOTENT : le webhook payout.failed ne recrédite pas une 2e fois', async () => {
    seedCard('card_ok');
    givenOpenThenRecredit();
    stripeConnect.createPayoutOnConnectedAccount.mockRejectedValue(
      new Error('Your card was declined.'),
    );

    await usecase.execute(
      { amount: 100, currency: 'EUR', payoutMethodId: 'card_ok', method: 'instant' } as any,
      user,
    );

    // Second déclencheur (webhook payout.failed) sur le MÊME retrait.
    dataSource.transaction.mockImplementationOnce(async (cb: any) => cb(recreditManager));
    const second = await usecase.recreditRetrait(
      'tx1',
      'Payout Stripe échoué (redélivrance)',
      TransactionStatus.ECHOUE,
    );

    expect(second).toBe('noop');
  });

  // ─── Aiguillage ────────────────────────────────────────────────────────────

  it('compte connecté sans payouts activés : CONNECT_NOT_READY, aucune validation de carte', async () => {
    stripeConnect.getAccountStatus.mockResolvedValue({
      connected: true,
      accountId: ACCOUNT,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
    const find = jest.spyOn(adapter, 'find');

    const res = await usecase.execute(
      { amount: 100, currency: 'EUR', payoutMethodId: 'card_ok', method: 'instant' } as any,
      user,
    );

    expect(res).toEqual(
      expect.objectContaining({ success: false, code: 'CONNECT_NOT_READY' }),
    );
    expect(find).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
