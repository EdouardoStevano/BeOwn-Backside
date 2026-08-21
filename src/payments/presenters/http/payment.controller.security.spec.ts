import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { RequestRetraitUseCase } from '../../applications/usecases/request-retrait.usecase';
import { PayoutDestinationResolver } from '../../applications/services/payout-destination.resolver';
import { InMemoryPayoutMethodsAdapter } from '../../infrastructure/in-memory-payout-methods.adapter';

/**
 * Tests de non-régression des correctifs de sécurité financière (audit
 * 2026-07-21) :
 *
 *  - H-1 : `confirmDepot` refuse de créditer un dépôt dont le PaymentIntent
 *          n'appartient pas à l'appelant (Broken Object-Level Authorization).
 *  - H-2 : `createRetrait` s'exécute dans une transaction avec décrément
 *          CONDITIONNEL (`solde >= amount`) — pas de solde négatif possible ;
 *          idempotence explicite via clé client (L-2).
 */
describe('PaymentController — sécurité des flux monétaires (H-1 / H-2)', () => {
  let controller: PaymentController;
  let requestRetrait: RequestRetraitUseCase;
  let stripeService: any;
  let stripeConnect: any;
  let notificationService: any;
  let walletRepo: any;
  let txRepo: any;
  let dataSource: any;
  let metricsPort: any;

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

  const user = { userId: 42, email: 'a@b.c', role: 'INVESTISSEUR' } as any;

  beforeEach(() => {
    stripeService = {
      retrievePaymentIntent: jest.fn(),
      constructWebhookEvent: jest.fn(),
    };
    // Compte Connect non configuré → createRetrait retombe sur le flux legacy
    // (IBAN + traitement manuel), comportement historiquement testé ici.
    stripeConnect = {
      getAccountStatus: jest.fn().mockResolvedValue({
        connected: false,
        accountId: null,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      }),
    };
    notificationService = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    walletRepo = {
      findOne: jest.fn(),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: 'w1', ...x })),
      createQueryBuilder: jest.fn(() => chainableQB({ affected: 1 })),
    };
    txRepo = {
      findOne: jest.fn(),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: 'tx1', ...x })),
    };
    dataSource = { transaction: jest.fn() };
    metricsPort = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };

    // H-2 (débit atomique conditionnel + idempotence L-2) vit désormais dans le
    // usecase retrait ; on l'instancie avec les mêmes mocks et on l'injecte.
    // Lot 4a — le usecase reçoit en plus le résolveur de destination. Il est
    // adossé à l'adaptateur EN MÉMOIRE (pas un mock) : sans `payoutMethodId` ni
    // `method` dans le DTO, il renvoie le parcours historique, ce qui garantit
    // que ces tests vérifient toujours le comportement d'origine.
    requestRetrait = new RequestRetraitUseCase(
      txRepo,
      stripeConnect,
      notificationService,
      dataSource,
      metricsPort,
      new PayoutDestinationResolver(new InMemoryPayoutMethodsAdapter()),
    );

    controller = new PaymentController(
      stripeService,
      /* identityService */ {} as any,
      stripeConnect,
      /* updateKycStatus */ {} as any,
      notificationService,
      /* auditLog */ {} as any,
      /* config */ { get: jest.fn() } as any,
      /* profilRepository */ {} as any,
      walletRepo,
      txRepo,
      dataSource,
      requestRetrait,
      metricsPort,
    );
  });

  // ── H-1 ────────────────────────────────────────────────────────────────────
  describe('confirmDepot — anti-BOLA (H-1)', () => {
    it("refuse le crédit si le PaymentIntent appartient à un autre utilisateur", async () => {
      stripeService.retrievePaymentIntent.mockResolvedValue({
        status: 'succeeded',
        amount: 100_00,
        metadata: { userId: '99' }, // ≠ appelant (42)
      });

      await expect(
        controller.confirmDepot({ paymentIntentId: 'pi_victim' } as any, user),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Aucun wallet crédité, aucune transaction écrite.
      expect(walletRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(txRepo.save).not.toHaveBeenCalled();
    });

    it("refuse le crédit si le PaymentIntent ne porte pas de metadata.userId", async () => {
      stripeService.retrievePaymentIntent.mockResolvedValue({
        status: 'succeeded',
        amount: 100_00,
        metadata: {},
      });

      await expect(
        controller.confirmDepot({ paymentIntentId: 'pi_x' } as any, user),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('crédite le wallet quand le PaymentIntent appartient bien à l\'appelant', async () => {
      stripeService.retrievePaymentIntent.mockResolvedValue({
        status: 'succeeded',
        amount: 100_00,
        currency: 'eur',
        metadata: { userId: '42' },
      });
      walletRepo.findOne.mockResolvedValue({ id: 'w1', devise: 'EUR' });

      // H-A : le crédit est désormais ATOMIQUE — insert ledger (clé unique)
      // PUIS incrément wallet, dans une transaction DB. On instrumente le
      // manager pour vérifier l'ordre insert-avant-incrément.
      const em: any = {
        insert: jest.fn().mockResolvedValue(undefined),
        createQueryBuilder: jest.fn(() => chainableQB({ affected: 1 })),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(em));

      const res = await controller.confirmDepot(
        { paymentIntentId: 'pi_own' } as any,
        user,
      );

      expect(res).toEqual({ success: true, walletId: 'w1' });
      // Ledger inséré EN PREMIER (contrainte unique = garde d'idempotence)…
      expect(em.insert).toHaveBeenCalled();
      // …puis crédit atomique du wallet.
      expect(em.createQueryBuilder).toHaveBeenCalled();
    });

    it('est idempotent : un dépôt déjà traité (violation 23505) ne re-crédite pas', async () => {
      stripeService.retrievePaymentIntent.mockResolvedValue({
        status: 'succeeded',
        amount: 100_00,
        currency: 'eur',
        metadata: { userId: '42' },
      });
      walletRepo.findOne.mockResolvedValue({ id: 'w1', devise: 'EUR' });

      const em: any = {
        // Doublon : l'insert du ledger lève une violation d'unicité Postgres.
        insert: jest.fn().mockRejectedValue({ code: '23505' }),
        createQueryBuilder: jest.fn(() => chainableQB({ affected: 1 })),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(em));

      const res = await controller.confirmDepot(
        { paymentIntentId: 'pi_dup' } as any,
        user,
      );

      expect(res).toEqual({ success: true, alreadyProcessed: true });
      // Aucun incrément de solde ne doit avoir eu lieu (insert a échoué avant).
      expect(em.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ── C-2 ────────────────────────────────────────────────────────────────────
  describe('dépôt — verrouillage de la devise à l\'EUR (C-2)', () => {
    it('confirmDepot: refuse un dépôt en devise ≠ EUR (BadRequestException, aucun crédit)', async () => {
      // PaymentIntent facturé ~1,3 € (50 000 fillér) mais qui créditerait 500 €.
      stripeService.retrievePaymentIntent.mockResolvedValue({
        status: 'succeeded',
        amount: 500_00,
        currency: 'huf',
        metadata: { userId: '42' }, // propriété OK (garde BOLA passée)
      });

      await expect(
        controller.confirmDepot({ paymentIntentId: 'pi_huf' } as any, user),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Aucun crédit : ni ouverture de transaction, ni wallet touché.
      expect(walletRepo.findOne).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(txRepo.save).not.toHaveBeenCalled();
    });

    it('confirmDepot: refuse un dépôt sans devise (défense en profondeur)', async () => {
      stripeService.retrievePaymentIntent.mockResolvedValue({
        status: 'succeeded',
        amount: 500_00,
        metadata: { userId: '42' }, // currency absente
      });

      await expect(
        controller.confirmDepot({ paymentIntentId: 'pi_nocur' } as any, user),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('webhook payment_intent.succeeded: ne crédite PAS un intent ≠ EUR et escalade aux admins', async () => {
      stripeService.constructWebhookEvent.mockReturnValue({
        id: 'evt_huf',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_huf',
            currency: 'huf',
            amount: 500_00,
            metadata: { userId: '42', operationType: 'depot' },
          },
        },
      });

      const res = await controller.handleStripeWebhook('sig', {
        rawBody: Buffer.from('{}'),
      } as any);

      // 200 renvoyé (pas de throw → Stripe ne rejoue pas indéfiniment)…
      expect(res).toEqual({
        received: true,
        type: 'payment_intent.succeeded',
        eventId: 'evt_huf',
      });
      // …mais aucun crédit, et escalade admin.
      expect(walletRepo.findOne).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(notificationService.pushToAdmins).toHaveBeenCalled();
    });

    it('webhook payment_intent.succeeded: crédite bien un dépôt en EUR (non-régression)', async () => {
      stripeService.constructWebhookEvent.mockReturnValue({
        id: 'evt_eur',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_eur',
            currency: 'eur',
            amount: 100_00,
            metadata: { userId: '42', operationType: 'depot' },
          },
        },
      });
      walletRepo.findOne.mockResolvedValue({ id: 'w1', devise: 'EUR' });
      const em: any = {
        insert: jest.fn().mockResolvedValue(undefined),
        createQueryBuilder: jest.fn(() => chainableQB({ affected: 1 })),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(em));

      await controller.handleStripeWebhook('sig', {
        rawBody: Buffer.from('{}'),
      } as any);

      // Crédit atomique effectué, pas d'escalade admin (chemin nominal).
      expect(em.insert).toHaveBeenCalled();
      expect(notificationService.pushToAdmins).not.toHaveBeenCalled();
    });
  });

  // ── H-2 ────────────────────────────────────────────────────────────────────
  describe('createRetrait — décrément atomique conditionnel (H-2)', () => {
    const runTx = (manager: any) =>
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    it('rejette "Solde insuffisant" quand le décrément conditionnel n\'affecte aucune ligne', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({ id: 'w1', solde: 5 }),
        createQueryBuilder: jest.fn(() => chainableQB({ affected: 0 })), // solde < amount
        create: jest.fn(),
        save: jest.fn(),
      };
      runTx(manager);

      const res = await controller.createRetrait(
        { walletId: 'w1', amount: 100, currency: 'EUR', ibanDestination: 'FR..' } as any,
        user,
      );

      expect(res).toEqual({ success: false, message: 'Solde insuffisant' });
      expect(manager.save).not.toHaveBeenCalled(); // aucune transaction créée
    });

    it('débite et enregistre la demande de retrait quand le solde est suffisant', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({ id: 'w1', solde: 500 }),
        createQueryBuilder: jest.fn(() => chainableQB({ affected: 1 })),
        create: jest.fn((_e: any, x: any) => x),
        save: jest.fn(async (x: any) => ({ id: 'tx1', statut: x.statut })),
      };
      runTx(manager);

      const res = await controller.createRetrait(
        { walletId: 'w1', amount: 100, currency: 'EUR', ibanDestination: 'FR..' } as any,
        user,
      );

      expect(res).toEqual(
        expect.objectContaining({ success: true, transactionId: 'tx1' }),
      );
      expect(manager.save).toHaveBeenCalledTimes(1);
    });

    it('est idempotent : une resoumission avec la même clé ne rejoue pas le débit', async () => {
      txRepo.findOne.mockResolvedValue({ id: 'tx-existing', statut: 'EN_ATTENTE_PAIEMENT' });

      const res = await controller.createRetrait(
        {
          walletId: 'w1',
          amount: 100,
          currency: 'EUR',
          ibanDestination: 'FR..',
          idempotencyKey: 'client-key-1',
        } as any,
        user,
      );

      expect(res).toEqual(
        expect.objectContaining({ success: true, alreadyProcessed: true, transactionId: 'tx-existing' }),
      );
      // La transaction bancaire ne doit jamais être ouverte pour un rejeu.
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
