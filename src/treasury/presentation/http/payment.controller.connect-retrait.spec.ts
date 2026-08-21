import { PaymentController } from './payment.controller';
import { RequestRetraitUseCase } from '../../application/usecases/request-retrait.usecase';
import {
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';

/**
 * E3 — Retrait via Stripe Connect Express : invariants de SÉCURITÉ ARGENT
 * testables sans clés Stripe (les appels Stripe eux-mêmes sont mockés) :
 *
 *  - Échec du Transfer → rollback intégral (wallet recrédité, retrait ECHOUE).
 *  - Recrédit IDEMPOTENT : jamais deux crédits pour le même retrait, quel que
 *    soit le nombre de déclencheurs (échec synchrone + webhook payout.failed).
 *  - Webhook `payout.failed` → reversal du transfert PUIS recrédit du wallet.
 *
 * Le débit atomique lui-même (verrou pessimiste + décrément conditionnel) est
 * couvert par payment.controller.security.spec.ts (H-2).
 */
describe('PaymentController — retrait Stripe Connect (E3, sécurité argent)', () => {
  let controller: PaymentController;
  let requestRetrait: RequestRetraitUseCase;
  let stripeConnect: any;
  let notificationService: any;
  let walletRepo: any;
  let txRepo: any;
  let dataSource: any;

  const user = { userId: 42, email: 'a@b.c', role: 'INVESTISSEUR' } as any;

  /** Query builder chaînable dont `.execute()` renvoie `result`. */
  const chainableQB = (result: any) => {
    const qb: any = {};
    qb.update = jest.fn(() => qb);
    qb.set = jest.fn(() => qb);
    qb.setParameter = jest.fn(() => qb);
    qb.where = jest.fn(() => qb);
    qb.execute = jest.fn().mockResolvedValue(result);
    return qb;
  };

  beforeEach(() => {
    stripeConnect = {
      getAccountStatus: jest.fn().mockResolvedValue({
        connected: true,
        accountId: 'acct_1',
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
      }),
      createTransfer: jest.fn(),
      createPayoutOnConnectedAccount: jest.fn(),
      reverseTransfer: jest.fn().mockResolvedValue(undefined),
      findUserByConnectAccountId: jest.fn(),
      syncAccountFromWebhook: jest.fn(),
    };
    notificationService = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    walletRepo = { findOne: jest.fn() };
    txRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(async (x: any) => x),
    };
    dataSource = { transaction: jest.fn() };

    // Le usecase porte désormais la logique retrait/recrédit (SRP) ; on l'instancie
    // avec les mêmes mocks puis on l'injecte dans le contrôleur.
    requestRetrait = new RequestRetraitUseCase(
      txRepo,
      stripeConnect,
      notificationService,
      dataSource,
    );

    controller = new PaymentController(
      /* stripeService */ {} as any,
      stripeConnect,
      notificationService,
      /* config */ { get: jest.fn() } as any,
      /* identityWebhook */ { handle: jest.fn() } as any,
      walletRepo,
      txRepo,
      dataSource,
      requestRetrait,
    );
  });

  it("sans walletId : résout le wallet INVESTISSEUR de l'utilisateur (front n'envoie que le montant)", async () => {
    const openManager = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'w1', solde: 500, devise: 'EUR' }),
      createQueryBuilder: jest.fn(() => chainableQB({ affected: 1 })),
      create: jest.fn((_e: any, x: any) => x),
      save: jest.fn(async (x: any) => ({ ...x, id: 'tx1' })),
    };
    dataSource.transaction.mockImplementationOnce(async (cb: any) =>
      cb(openManager),
    );
    stripeConnect.createTransfer.mockResolvedValue('tr_1');
    stripeConnect.createPayoutOnConnectedAccount.mockResolvedValue('po_1');

    // Le front Connect n'envoie que { amount, currency } — pas de walletId.
    const res = await controller.createRetrait(
      { amount: 100, currency: 'EUR' } as any,
      user,
    );

    expect(res).toEqual(
      expect.objectContaining({ success: true, transactionId: 'tx1' }),
    );
    // Wallet résolu par propriétaire + type INVESTISSEUR (jamais par id fourni).
    expect(openManager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: expect.objectContaining({
          proprietaireUserId: 42,
          type: WalletType.INVESTISSEUR,
        }),
      }),
    );
    // Débit atomique bien exécuté sur le wallet résolu.
    expect(openManager.createQueryBuilder).toHaveBeenCalled();
  });

  it('rollback intégral quand le Transfer Stripe échoue (wallet recrédité, ECHOUE)', async () => {
    // 1er appel dataSource.transaction = ouverture (débit) ; 2e = recrédit.
    const openManager = {
      findOne: jest.fn().mockResolvedValue({ id: 'w1', solde: 500 }),
      createQueryBuilder: jest.fn(() => chainableQB({ affected: 1 })),
      create: jest.fn((_e: any, x: any) => x),
      save: jest.fn(async (x: any) => ({ ...x, id: 'tx1' })),
    };
    const txRow: any = {
      id: 'tx1',
      type: TransactionType.RETRAIT,
      statut: TransactionStatus.EN_COURS,
      montant: 100,
      walletId: 'w1',
      metadata: {
        method: 'stripe_connect',
        connectedAccountId: 'acct_1',
        userId: 42,
      },
    };
    const recreditQB = chainableQB({ affected: 1 });
    const recreditManager = {
      findOne: jest.fn().mockResolvedValue(txRow),
      createQueryBuilder: jest.fn(() => recreditQB),
      save: jest.fn(async (x: any) => x),
    };
    dataSource.transaction
      .mockImplementationOnce(async (cb: any) => cb(openManager))
      .mockImplementationOnce(async (cb: any) => cb(recreditManager));

    stripeConnect.createTransfer.mockRejectedValue(
      new Error('insufficient funds'),
    );

    const res = await controller.createRetrait(
      { walletId: 'w1', amount: 100, currency: 'EUR' } as any,
      user,
    );

    expect(res).toEqual(
      expect.objectContaining({ success: false, code: 'TRANSFER_FAILED' }),
    );
    // Le wallet a bien été recrédité (+ montant) et le retrait marqué ECHOUE.
    expect(recreditManager.createQueryBuilder).toHaveBeenCalled();
    expect(txRow.statut).toBe(TransactionStatus.ECHOUE);
    expect(txRow.metadata.recredited).toBe(true);
    // Pas de payout tenté après un transfer échoué.
    expect(stripeConnect.createPayoutOnConnectedAccount).not.toHaveBeenCalled();
    // Investisseur notifié de l'échec.
    expect(notificationService.push).toHaveBeenCalled();
  });

  it('recrédit IDEMPOTENT : un second déclencheur ne recrédite pas une 2e fois', async () => {
    const txRow: any = {
      id: 'tx1',
      type: TransactionType.RETRAIT,
      statut: TransactionStatus.EN_COURS,
      montant: 100,
      walletId: 'w1',
      metadata: { userId: 42 },
    };
    const qb1 = chainableQB({ affected: 1 });
    const qb2 = chainableQB({ affected: 1 });
    const manager = {
      // findOne renvoie l'objet partagé, muté par le 1er recrédit.
      findOne: jest.fn().mockImplementation(async () => txRow),
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(qb1)
        .mockReturnValueOnce(qb2),
      save: jest.fn(async (x: any) => x),
    };
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    const first = await (requestRetrait as any).recreditRetrait(
      'tx1',
      'payout échoué',
      TransactionStatus.ECHOUE,
    );
    const second = await (requestRetrait as any).recreditRetrait(
      'tx1',
      'payout échoué (redélivrance)',
      TransactionStatus.ECHOUE,
    );

    expect(first).toBe('recredited');
    expect(second).toBe('noop');
    // Un SEUL crédit wallet malgré deux appels.
    expect(qb1.execute).toHaveBeenCalledTimes(1);
    expect(qb2.execute).not.toHaveBeenCalled();
  });

  it('webhook payout.failed → reversal du transfert PUIS recrédit du wallet', async () => {
    const txRow: any = {
      id: 'tx1',
      type: TransactionType.RETRAIT,
      statut: TransactionStatus.EN_COURS,
      montant: 100,
      walletId: 'w1',
      metadata: {
        userId: 42,
        transferId: 'tr_1',
        connectedAccountId: 'acct_1',
      },
    };
    // txRepo.findOne (lecture initiale du handler) renvoie le retrait.
    txRepo.findOne.mockResolvedValue(txRow);
    // recreditRetrait utilise dataSource.transaction + manager.findOne.
    const recreditQB = chainableQB({ affected: 1 });
    const manager = {
      findOne: jest.fn().mockResolvedValue(txRow),
      createQueryBuilder: jest.fn(() => recreditQB),
      save: jest.fn(async (x: any) => x),
    };
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    const event = {
      id: 'evt_1',
      type: 'payout.failed',
      account: 'acct_1',
      data: { object: { id: 'po_1', metadata: { retraitTxId: 'tx1' } } },
    };

    await (controller as any).handlePayoutFailed(event);

    // Reversal appelé AVANT recrédit, avec une clé idempotente stable.
    expect(stripeConnect.reverseTransfer).toHaveBeenCalledWith(
      'tr_1',
      'retrait-reverse:tx1',
    );
    // Wallet recrédité + retrait ECHOUE.
    expect(recreditQB.execute).toHaveBeenCalled();
    expect(txRow.statut).toBe(TransactionStatus.ECHOUE);
    expect(txRow.metadata.recredited).toBe(true);
    // Investisseur notifié.
    expect(notificationService.push).toHaveBeenCalled();
  });

  it('webhook payout.failed sans reversal possible → PAS de recrédit, alerte admin', async () => {
    const txRow: any = {
      id: 'tx1',
      type: TransactionType.RETRAIT,
      statut: TransactionStatus.EN_COURS,
      montant: 100,
      walletId: 'w1',
      metadata: { userId: 42, transferId: 'tr_1' },
    };
    txRepo.findOne.mockResolvedValue(txRow);
    stripeConnect.reverseTransfer.mockRejectedValue(
      new Error('reversal refused'),
    );
    dataSource.transaction.mockImplementation(async (cb: any) => cb({} as any));

    const event = {
      id: 'evt_1',
      type: 'payout.failed',
      account: 'acct_1',
      data: { object: { id: 'po_1', metadata: { retraitTxId: 'tx1' } } },
    };

    await (controller as any).handlePayoutFailed(event);

    // Aucun recrédit à l'aveugle : le retrait reste EN_COURS, admins alertés.
    expect(txRow.statut).toBe(TransactionStatus.EN_COURS);
    expect(txRow.metadata.recredited).toBeUndefined();
    expect(notificationService.pushToAdmins).toHaveBeenCalled();
  });
});
