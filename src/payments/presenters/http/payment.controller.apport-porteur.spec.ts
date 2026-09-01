import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { UserRole } from 'src/iam/domains/enums/user.enum';

const PORTEUR = { userId: 7, email: 'porteur@beown.fr', role: UserRole.PORTEUR } as any;
const AUTRE_PORTEUR = { userId: 99, email: 'tiers@beown.fr', role: UserRole.PORTEUR } as any;
const PROJET_ID = 'c1f0b6e2-3f1a-4a8e-9d3c-2b6f0a1d4e77';

/**
 * Contrôleur monté à la main avec des doubles — le seul montage qui permette de
 * vérifier les GARDES du chemin de l'argent sans base ni réseau. Chaque test
 * n'ajuste que les doubles qui le concernent.
 */
function build(overrides: Record<string, any> = {}) {
  const stripeService = {
    createPaymentIntent: jest
      .fn()
      .mockResolvedValue({ clientSecret: 'cs_1', intentId: 'pi_1' }),
    retrievePaymentIntent: jest.fn(),
    constructWebhookEvent: jest.fn(),
    ...(overrides.stripeService ?? {}),
  };
  const crediterApportPorteur = {
    execute: jest.fn().mockResolvedValue({
      credite: true,
      walletId: 'w-projet',
      soldeApres: 25_000,
    }),
    ...(overrides.crediterApportPorteur ?? {}),
  };
  const projectRepo = {
    findOne: jest.fn().mockResolvedValue({ id: PROJET_ID, porteurId: PORTEUR.userId }),
    ...(overrides.projectRepo ?? {}),
  };
  const notificationService = {
    push: jest.fn().mockResolvedValue(undefined),
    pushToAdmins: jest.fn().mockResolvedValue(undefined),
  };
  const metrics = {
    incrementCounter: jest.fn(),
    observeHistogram: jest.fn(),
    setGauge: jest.fn(),
  };

  const controller = new PaymentController(
    stripeService as any,
    /* identityService */ {} as any,
    /* stripeConnect */ {} as any,
    /* updateKycStatus */ {} as any,
    notificationService as any,
    /* auditLog */ {} as any,
    /* config */ { get: jest.fn() } as any,
    /* profilRepository */ {} as any,
    /* walletRepo */ { findOne: jest.fn() } as any,
    /* txRepo */ { findOne: jest.fn(), insert: jest.fn(), save: jest.fn() } as any,
    projectRepo as any,
    /* dataSource */ {} as any,
    /* requestRetrait */ {} as any,
    crediterApportPorteur as any,
    metrics as any,
    /* transactionalEmails */ {
      depotConfirme: jest.fn().mockResolvedValue(undefined),
      retraitExecute: jest.fn().mockResolvedValue(undefined),
    } as any,
    /* amlMonitor */ { check: jest.fn().mockResolvedValue(undefined) } as any,
    /* retraitSettlement */ {} as any,
  );

  return { controller, stripeService, crediterApportPorteur, projectRepo, notificationService, metrics };
}

const DTO = { amount: 25_000, currency: 'EUR', projetId: PROJET_ID };

describe('PaymentController — apport porteur : création de l’intention', () => {
  it('crée l’intention pour le porteur du projet, avec le projetId posé par le SERVEUR', async () => {
    const { controller, stripeService } = build();

    await controller.createApportPorteurIntent(DTO as any, PORTEUR);

    expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 25_000,
        currency: 'EUR',
        userId: PORTEUR.userId,
        metadata: expect.objectContaining({
          operationType: 'apport_porteur',
          projetId: PROJET_ID,
        }),
      }),
    );
  });

  it('refuse un projet que l’appelant ne porte pas — AVANT tout appel au prestataire', async () => {
    const { controller, stripeService } = build();

    await expect(
      controller.createApportPorteurIntent(DTO as any, AUTRE_PORTEUR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stripeService.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('refuse un projet inexistant', async () => {
    const { controller } = build({
      projectRepo: { findOne: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      controller.createApportPorteurIntent(DTO as any, PORTEUR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('admet un rôle habilité à décaisser, pour les régularisations du back-office', async () => {
    const { controller, stripeService } = build();
    const financier = { userId: 500, email: 'fin@beown.fr', role: UserRole.FINANCIER } as any;

    await controller.createApportPorteurIntent(DTO as any, financier);

    expect(stripeService.createPaymentIntent).toHaveBeenCalled();
  });
});

describe('PaymentController — apport porteur : confirmation synchrone', () => {
  const intentReussi = {
    status: 'succeeded',
    amount: 2_500_000, // centimes
    currency: 'eur',
    metadata: {
      operationType: 'apport_porteur',
      projetId: PROJET_ID,
      userId: String(PORTEUR.userId),
    },
  };

  it('crédite le portefeuille du projet', async () => {
    const { controller, crediterApportPorteur } = build({
      stripeService: {
        retrievePaymentIntent: jest.fn().mockResolvedValue(intentReussi),
      },
    });

    const res = await controller.confirmApportPorteur(
      { paymentIntentId: 'pi_1' } as any,
      PORTEUR,
    );

    expect(crediterApportPorteur.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        projetId: PROJET_ID,
        paymentIntentId: 'pi_1',
        montantEur: 25_000,
        porteurUserId: PORTEUR.userId,
        origine: 'confirm',
      }),
    );
    expect(res).toEqual(
      expect.objectContaining({ success: true, projetId: PROJET_ID }),
    );
  });

  it('refuse le paiement d’un TIERS (garde d’appartenance), sans rien créditer', async () => {
    const { controller, crediterApportPorteur } = build({
      stripeService: {
        retrievePaymentIntent: jest.fn().mockResolvedValue({
          ...intentReussi,
          metadata: { ...intentReussi.metadata, userId: '4242' },
        }),
      },
    });

    await expect(
      controller.confirmApportPorteur({ paymentIntentId: 'pi_1' } as any, PORTEUR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(crediterApportPorteur.execute).not.toHaveBeenCalled();
  });

  it('refuse une devise ≠ EUR : le crédit est libellé en euros', async () => {
    const { controller, crediterApportPorteur } = build({
      stripeService: {
        retrievePaymentIntent: jest
          .fn()
          .mockResolvedValue({ ...intentReussi, currency: 'huf' }),
      },
    });

    await expect(
      controller.confirmApportPorteur({ paymentIntentId: 'pi_1' } as any, PORTEUR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(crediterApportPorteur.execute).not.toHaveBeenCalled();
  });

  it('refuse un paiement qui n’est pas un apport (dépôt investisseur détourné)', async () => {
    const { controller, crediterApportPorteur } = build({
      stripeService: {
        retrievePaymentIntent: jest.fn().mockResolvedValue({
          ...intentReussi,
          metadata: { ...intentReussi.metadata, operationType: 'depot' },
        }),
      },
    });

    await expect(
      controller.confirmApportPorteur({ paymentIntentId: 'pi_1' } as any, PORTEUR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(crediterApportPorteur.execute).not.toHaveBeenCalled();
  });

  it('ne crédite rien tant que le paiement n’a pas abouti', async () => {
    const { controller, crediterApportPorteur } = build({
      stripeService: {
        retrievePaymentIntent: jest
          .fn()
          .mockResolvedValue({ ...intentReussi, status: 'requires_action' }),
      },
    });

    const res = await controller.confirmApportPorteur(
      { paymentIntentId: 'pi_1' } as any,
      PORTEUR,
    );

    expect(res).toEqual({ success: false, status: 'requires_action' });
    expect(crediterApportPorteur.execute).not.toHaveBeenCalled();
  });

  it('rend un no-op explicite sur un apport déjà traité', async () => {
    const { controller } = build({
      stripeService: {
        retrievePaymentIntent: jest.fn().mockResolvedValue(intentReussi),
      },
      crediterApportPorteur: {
        execute: jest
          .fn()
          .mockResolvedValue({ credite: false, walletId: 'w-projet', soldeApres: 0 }),
      },
    });

    const res = await controller.confirmApportPorteur(
      { paymentIntentId: 'pi_1' } as any,
      PORTEUR,
    );

    expect(res).toEqual({ success: true, alreadyProcessed: true, projetId: PROJET_ID });
  });
});

describe('PaymentController — apport porteur : webhook', () => {
  const evenement = (intent: any) => ({
    type: 'payment_intent.succeeded',
    id: 'evt_1',
    data: { object: intent },
  });

  const intent = {
    id: 'pi_wh',
    amount: 2_500_000,
    currency: 'eur',
    metadata: {
      operationType: 'apport_porteur',
      projetId: PROJET_ID,
      userId: String(PORTEUR.userId),
    },
  };

  const passerWebhook = async (h: ReturnType<typeof build>, objet: any) => {
    h.stripeService.constructWebhookEvent.mockReturnValue(evenement(objet));
    return h.controller.handleStripeWebhook('sig', { rawBody: Buffer.from('{}') } as any);
  };

  it('crédite le portefeuille du projet', async () => {
    const h = build();
    await passerWebhook(h, intent);

    expect(h.crediterApportPorteur.execute).toHaveBeenCalledWith(
      expect.objectContaining({ projetId: PROJET_ID, origine: 'webhook' }),
    );
  });

  it('ne crédite RIEN si le projet n’est pas porté par le payeur — et alerte Finance', async () => {
    const h = build({
      projectRepo: {
        findOne: jest.fn().mockResolvedValue({ id: PROJET_ID, porteurId: 12345 }),
      },
    });
    await passerWebhook(h, intent);

    expect(h.crediterApportPorteur.execute).not.toHaveBeenCalled();
    expect(h.notificationService.pushToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: expect.arrayContaining([UserRole.FINANCIER]),
      }),
    );
  });

  it('ne crédite RIEN sur un projet introuvable', async () => {
    const h = build({ projectRepo: { findOne: jest.fn().mockResolvedValue(null) } });
    await passerWebhook(h, intent);
    expect(h.crediterApportPorteur.execute).not.toHaveBeenCalled();
  });

  it('ne crédite RIEN en devise ≠ EUR, et ne lève pas (Stripe rejouerait 3 jours)', async () => {
    const h = build();
    await expect(
      passerWebhook(h, { ...intent, currency: 'huf' }),
    ).resolves.toEqual(expect.objectContaining({ received: true }));
    expect(h.crediterApportPorteur.execute).not.toHaveBeenCalled();
  });

  it('ne crédite RIEN quand aucun projet n’est désigné', async () => {
    const h = build();
    await passerWebhook(h, {
      ...intent,
      metadata: { operationType: 'apport_porteur', userId: String(PORTEUR.userId) },
    });
    expect(h.crediterApportPorteur.execute).not.toHaveBeenCalled();
  });
});
