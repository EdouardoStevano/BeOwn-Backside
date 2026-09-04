import { PaymentController } from './payment.controller';
import {
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { RetraitSettlementService } from '../../applications/services/retrait-settlement.service';

/**
 * Branches « argent » du webhook Stripe, longtemps aveugles : un paiement
 * refusé, un remboursement, une contestation bancaire, un transfert annulé ou
 * un versement annulé n'étaient tout simplement PAS traités. Chacune de ces
 * situations laisse le solde de l'investisseur et la trésorerie réelle en
 * désaccord ; ce sont donc des chemins où une erreur se paie en euros.
 *
 * Les invariants vérifiés ici :
 *  - idempotence : Stripe redélivre ses événements pendant ~3 jours, aucun
 *    d'eux ne doit débiter, créditer ou alerter deux fois ;
 *  - jamais de solde négatif : un remboursement non couvert est escaladé, pas
 *    forcé ;
 *  - jamais de recrédit à l'aveugle : tant qu'on ignore où sont les fonds, on
 *    n'en remet pas sur le portefeuille.
 */
describe('PaymentController — branches argent du webhook Stripe', () => {
  let controller: PaymentController;
  let stripeService: any;
  let stripeConnect: any;
  let notificationService: any;
  let walletRepo: any;
  let txRepo: any;
  let dataSource: any;
  let metricsPort: any;
  let requestRetrait: any;
  let transactionalEmails: any;
  let amlMonitor: any;

  /** Écritures insérées via `txRepo.insert` / `em.insert`. */
  let inserees: any[];
  /** Résultat que renvoie l'UPDATE conditionnel du solde. */
  let updateAffected: number;
  /** Erreur à lever à la prochaine insertion (simulation d'unicité). */
  let prochaineInsertionEnDoublon: boolean;

  const violationUnicite = () => Object.assign(new Error('dup'), { code: '23505' });

  const chainableQB = () => {
    const qb: any = {};
    qb.update = jest.fn(() => qb);
    qb.set = jest.fn(() => qb);
    qb.setParameter = jest.fn(() => qb);
    qb.where = jest.fn(() => qb);
    qb.execute = jest.fn(async () => ({ affected: updateAffected }));
    return qb;
  };

  const declencher = async (event: any) => {
    stripeService.constructWebhookEvent.mockReturnValue(event);
    return controller.handleStripeWebhook('sig', {
      rawBody: Buffer.from('{}'),
    } as any);
  };

  beforeEach(() => {
    inserees = [];
    updateAffected = 1;
    prochaineInsertionEnDoublon = false;

    stripeService = { constructWebhookEvent: jest.fn() };
    stripeConnect = {
      findTransferIdForRetrait: jest.fn().mockResolvedValue(null),
      reverseTransfer: jest.fn().mockResolvedValue(undefined),
    };
    notificationService = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    walletRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'w-1', proprietaireUserId: 42, solde: 500 }),
    };
    txRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (x: any) => x),
      insert: jest.fn(async (obj: any) => {
        if (prochaineInsertionEnDoublon) throw violationUnicite();
        inserees.push(obj);
        return { identifiers: [] };
      }),
    };
    dataSource = {
      transaction: jest.fn(async (cb: any) =>
        cb({
          insert: jest.fn(async (_entity: any, obj: any) => {
            if (prochaineInsertionEnDoublon) throw violationUnicite();
            inserees.push(obj);
            return { identifiers: [] };
          }),
          createQueryBuilder: jest.fn(chainableQB),
        }),
      ),
    };
    metricsPort = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };
    requestRetrait = {
      recreditRetrait: jest.fn().mockResolvedValue('recredited'),
      notifyRetraitEchec: jest.fn(),
    };
    transactionalEmails = {
      depotConfirme: jest.fn().mockResolvedValue(undefined),
      retraitExecute: jest.fn().mockResolvedValue(undefined),
      kycValide: jest.fn().mockResolvedValue(undefined),
      kycRefuse: jest.fn().mockResolvedValue(undefined),
    };
    amlMonitor = { check: jest.fn().mockResolvedValue(undefined) };

    controller = new PaymentController(
      stripeService,
      /* identityService */ {} as any,
      stripeConnect,
      /* updateKycStatus */ {} as any,
      notificationService,
      /* auditLog */ { create: jest.fn().mockResolvedValue(undefined) } as any,
      /* config */ { get: jest.fn() } as any,
      /* profilRepository */ {} as any,
      walletRepo,
      txRepo,
      /* projectRepo */ { findOne: jest.fn().mockResolvedValue(null) } as any,
      dataSource,
      requestRetrait,
      /* crediterApportPorteur */ { execute: jest.fn() } as any,
      metricsPort,
      transactionalEmails,
      amlMonitor,
      // Clôture des retraits extraite du contrôleur (partagée avec le balayage
      // de rattrapage), instanciée avec les mêmes mocks : ces tests continuent
      // d'observer exactement les mêmes objets.
      new RetraitSettlementService(
        txRepo,
        stripeConnect,
        notificationService,
        metricsPort,
        requestRetrait,
        transactionalEmails,
      ),
      /* gelDesAvoirs */ { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  // ── payment_intent.payment_failed ──────────────────────────────────────────

  describe('payment_intent.payment_failed', () => {
    const evenementEchec = (id = 'pi_1') => ({
      id: 'evt_1',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id,
          amount: 25000,
          currency: 'eur',
          metadata: { userId: '42', operationType: 'depot' },
          last_payment_error: { message: 'Votre carte a été refusée.' },
        },
      },
    });

    it('inscrit une écriture ECHOUE avec le motif du prestataire et prévient le déposant', async () => {
      await declencher(evenementEchec());

      expect(inserees).toHaveLength(1);
      expect(inserees[0]).toMatchObject({
        type: TransactionType.DEPOT,
        statut: TransactionStatus.ECHOUE,
        montant: 250,
        walletDestination: 'w-1',
        walletSource: null,
        idempotencyKey: 'depot-echoue:pi_1',
        motifEchec: 'Votre carte a été refusée.',
      });

      expect(notificationService.push).toHaveBeenCalledTimes(1);
      const notif = notificationService.push.mock.calls[0][0];
      expect(notif.utilisateurId).toBe(42);
      expect(notif.titre).toBe('Dépôt échoué');
      expect(notif.message).toContain('Votre carte a été refusée.');
    });

    it('ne touche à RIEN si le dépôt a finalement été crédité (tentative antérieure)', async () => {
      txRepo.findOne.mockResolvedValue({ id: 'tx-depot', statut: TransactionStatus.REUSSI });

      await declencher(evenementEchec());

      expect(txRepo.insert).not.toHaveBeenCalled();
      expect(notificationService.push).not.toHaveBeenCalled();
    });

    it('idempotent : une redélivrance ne renotifie pas', async () => {
      prochaineInsertionEnDoublon = true;

      await declencher(evenementEchec());

      expect(notificationService.push).not.toHaveBeenCalled();
    });

    it('ignore un paiement qui n’est pas un dépôt', async () => {
      const event = evenementEchec();
      event.data.object.metadata.operationType = 'autre';

      await declencher(event);

      expect(txRepo.insert).not.toHaveBeenCalled();
    });
  });

  // ── charge.refunded ────────────────────────────────────────────────────────

  describe('charge.refunded', () => {
    const evenementRemboursement = () => ({
      id: 'evt_2',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_1',
          amount_refunded: 12000,
          currency: 'eur',
          payment_intent: 'pi_1',
        },
      },
    });

    const depotCredite = {
      id: 'tx-depot',
      walletDestination: 'w-1',
      devise: 'EUR',
      montant: 120,
    };

    it('débite le portefeuille une seule fois, écriture d’abord, clé refund:<chargeId>', async () => {
      txRepo.findOne.mockResolvedValue(depotCredite);

      await declencher(evenementRemboursement());

      expect(inserees).toHaveLength(1);
      expect(inserees[0]).toMatchObject({
        type: TransactionType.REMBOURSEMENT_DEPOT,
        statut: TransactionStatus.REUSSI,
        montant: 120,
        walletSource: 'w-1',
        walletDestination: null,
        idempotencyKey: 'refund:ch_1',
      });
      // La clé demandée figure AUSSI dans les metadata de l'écriture.
      expect(inserees[0].metadata).toMatchObject({ refundKey: 'refund:ch_1' });
    });

    it('idempotent : une redélivrance ne débite pas une seconde fois', async () => {
      txRepo.findOne.mockResolvedValue(depotCredite);
      prochaineInsertionEnDoublon = true;

      await declencher(evenementRemboursement());

      expect(notificationService.push).not.toHaveBeenCalled();
      expect(notificationService.pushToAdmins).not.toHaveBeenCalled();
    });

    it('solde insuffisant : AUCUN solde négatif forcé, trace ECHOUE et alerte Finance', async () => {
      txRepo.findOne.mockResolvedValue(depotCredite);
      updateAffected = 0; // le débit conditionnel `solde >= montant` ne passe pas

      await declencher(evenementRemboursement());

      // L'écriture REUSSI a été annulée par le rollback ; seule la trace
      // ECHOUE, écrite hors transaction, subsiste.
      const tracesEchouees = inserees.filter(
        (e) => e.statut === TransactionStatus.ECHOUE,
      );
      expect(tracesEchouees).toHaveLength(1);
      expect(tracesEchouees[0]).toMatchObject({
        idempotencyKey: 'refund:ch_1',
        walletSource: 'w-1',
      });
      expect(tracesEchouees[0].metadata).toMatchObject({ soldeInsuffisant: true });

      expect(notificationService.pushToAdmins).toHaveBeenCalledTimes(1);
      const alerte = notificationService.pushToAdmins.mock.calls[0][0];
      expect(alerte.roles).toEqual([UserRole.FINANCIER, UserRole.SUPER_ADMIN]);
    });

    it('remboursement non rattachable à un dépôt : alerte, aucun débit', async () => {
      txRepo.findOne.mockResolvedValue(null);

      await declencher(evenementRemboursement());

      expect(inserees).toHaveLength(0);
      expect(notificationService.pushToAdmins).toHaveBeenCalledTimes(1);
    });
  });

  // ── charge.dispute.created ─────────────────────────────────────────────────

  describe('charge.dispute.created', () => {
    const evenementLitige = () => ({
      id: 'evt_3',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_1',
          charge: 'ch_1',
          payment_intent: 'pi_1',
          amount: 30000,
          reason: 'fraudulent',
          status: 'needs_response',
        },
      },
    });

    it('marque le dépôt en litige et alerte Finance', async () => {
      const depot: any = { id: 'tx-depot', metadata: null };
      txRepo.findOne.mockResolvedValue(depot);

      await declencher(evenementLitige());

      expect(txRepo.save).toHaveBeenCalledTimes(1);
      expect(depot.metadata.litige).toMatchObject({
        disputeId: 'dp_1',
        chargeId: 'ch_1',
        motif: 'fraudulent',
        montant: 300,
      });
      expect(notificationService.pushToAdmins).toHaveBeenCalledTimes(1);
      expect(notificationService.pushToAdmins.mock.calls[0][0].roles).toEqual([
        UserRole.FINANCIER,
        UserRole.SUPER_ADMIN,
      ]);
    });

    it('idempotent : un litige déjà marqué n’est ni réécrit ni réalerté', async () => {
      txRepo.findOne.mockResolvedValue({
        id: 'tx-depot',
        metadata: { litige: { disputeId: 'dp_1' } },
      });

      await declencher(evenementLitige());

      expect(txRepo.save).not.toHaveBeenCalled();
      expect(notificationService.pushToAdmins).not.toHaveBeenCalled();
    });

    it('alerte quand même si aucun dépôt ne correspond à la charge contestée', async () => {
      txRepo.findOne.mockResolvedValue(null);

      await declencher(evenementLitige());

      expect(notificationService.pushToAdmins).toHaveBeenCalledTimes(1);
    });
  });

  // ── payout.failed / payout.canceled — jamais de recrédit à l'aveugle ───────

  describe('payout.failed / payout.canceled', () => {
    const retraitConnect = (metadata: Record<string, unknown>) => ({
      id: 'tx-retrait',
      type: TransactionType.RETRAIT,
      montant: 400,
      statut: TransactionStatus.EN_COURS,
      metadata,
    });

    const evenementPayout = (type: string) => ({
      id: 'evt_4',
      type,
      account: 'acct_1',
      data: { object: { id: 'po_1', metadata: { retraitTxId: 'tx-retrait' } } },
    });

    it('transferId absent et transfert INTROUVABLE : aucun recrédit, revue manuelle', async () => {
      const tx = retraitConnect({
        method: 'stripe_connect',
        connectedAccountId: 'acct_1',
        userId: 42,
      });
      txRepo.findOne.mockResolvedValue(tx);
      stripeConnect.findTransferIdForRetrait.mockResolvedValue(null);

      await declencher(evenementPayout('payout.failed'));

      expect(requestRetrait.recreditRetrait).not.toHaveBeenCalled();
      expect(stripeConnect.reverseTransfer).not.toHaveBeenCalled();
      expect((tx.metadata as any).revueManuelle).toMatchObject({
        raison: 'transfert_introuvable',
      });
      expect(notificationService.pushToAdmins).toHaveBeenCalledTimes(1);
    });

    it('transferId absent mais transfert RETROUVÉ : reversal puis recrédit, trace réparée', async () => {
      const tx = retraitConnect({
        method: 'stripe_connect',
        connectedAccountId: 'acct_1',
        userId: 42,
      });
      txRepo.findOne.mockResolvedValue(tx);
      stripeConnect.findTransferIdForRetrait.mockResolvedValue('tr_9');

      await declencher(evenementPayout('payout.failed'));

      expect((tx.metadata as any).transferId).toBe('tr_9');
      expect(stripeConnect.reverseTransfer).toHaveBeenCalledWith(
        'tr_9',
        'retrait-reverse:tx-retrait',
      );
      expect(requestRetrait.recreditRetrait).toHaveBeenCalledWith(
        'tx-retrait',
        expect.any(String),
        TransactionStatus.ECHOUE,
      );
    });

    it('parcours legacy : recrédit direct, aucun transfert à rechercher', async () => {
      txRepo.findOne.mockResolvedValue(
        retraitConnect({ method: 'legacy_manuel', userId: 42 }),
      );

      await declencher(evenementPayout('payout.failed'));

      expect(stripeConnect.findTransferIdForRetrait).not.toHaveBeenCalled();
      expect(stripeConnect.reverseTransfer).not.toHaveBeenCalled();
      expect(requestRetrait.recreditRetrait).toHaveBeenCalled();
    });

    it('payout.canceled applique la même discipline et clôt en ANNULE', async () => {
      txRepo.findOne.mockResolvedValue(
        retraitConnect({
          method: 'stripe_connect',
          connectedAccountId: 'acct_1',
          transferId: 'tr_3',
          userId: 42,
        }),
      );

      await declencher(evenementPayout('payout.canceled'));

      expect(stripeConnect.reverseTransfer).toHaveBeenCalledWith(
        'tr_3',
        'retrait-reverse:tx-retrait',
      );
      expect(requestRetrait.recreditRetrait).toHaveBeenCalledWith(
        'tx-retrait',
        expect.any(String),
        TransactionStatus.ANNULE,
      );
    });

    it('idempotent : un retrait déjà en revue manuelle n’est ni rejoué ni réalerté', async () => {
      txRepo.findOne.mockResolvedValue(
        retraitConnect({
          method: 'stripe_connect',
          revueManuelle: { raison: 'transfert_introuvable' },
        }),
      );

      await declencher(evenementPayout('payout.failed'));

      expect(stripeConnect.findTransferIdForRetrait).not.toHaveBeenCalled();
      expect(notificationService.pushToAdmins).not.toHaveBeenCalled();
      expect(requestRetrait.recreditRetrait).not.toHaveBeenCalled();
    });

    it('reversal impossible : aucun recrédit, escalade — les fonds restent localisés chez Stripe', async () => {
      txRepo.findOne.mockResolvedValue(
        retraitConnect({
          method: 'stripe_connect',
          transferId: 'tr_3',
          userId: 42,
        }),
      );
      stripeConnect.reverseTransfer.mockRejectedValue(new Error('reversal refused'));

      await declencher(evenementPayout('payout.failed'));

      expect(requestRetrait.recreditRetrait).not.toHaveBeenCalled();
      expect(notificationService.pushToAdmins).toHaveBeenCalledTimes(1);
    });
  });

  // ── transfer.reversed ──────────────────────────────────────────────────────

  describe('transfer.reversed', () => {
    const evenementReversal = () => ({
      id: 'evt_5',
      type: 'transfer.reversed',
      data: { object: { id: 'tr_3', metadata: { retraitTxId: 'tx-retrait' } } },
    });

    it('recrédite directement : les fonds sont déjà revenus sur la plateforme', async () => {
      txRepo.findOne.mockResolvedValue({
        id: 'tx-retrait',
        type: TransactionType.RETRAIT,
        montant: 400,
        metadata: { userId: 42 },
      });

      await declencher(evenementReversal());

      expect(stripeConnect.reverseTransfer).not.toHaveBeenCalled();
      expect(requestRetrait.recreditRetrait).toHaveBeenCalledWith(
        'tx-retrait',
        expect.any(String),
        TransactionStatus.ANNULE,
      );
      expect(requestRetrait.notifyRetraitEchec).toHaveBeenCalledWith(
        42,
        400,
        'tx-retrait',
      );
    });

    it('inoffensif après un recrédit déjà effectué (cas nominal : reversal demandé par nous)', async () => {
      txRepo.findOne.mockResolvedValue({
        id: 'tx-retrait',
        type: TransactionType.RETRAIT,
        montant: 400,
        metadata: { userId: 42 },
      });
      requestRetrait.recreditRetrait.mockResolvedValue('noop');

      await declencher(evenementReversal());

      expect(requestRetrait.notifyRetraitEchec).not.toHaveBeenCalled();
    });

    it('sans retraitTxId : simple information, aucune écriture', async () => {
      const event = evenementReversal();
      (event.data.object as any).metadata = {};

      await declencher(event);

      expect(requestRetrait.recreditRetrait).not.toHaveBeenCalled();
    });
  });
});
