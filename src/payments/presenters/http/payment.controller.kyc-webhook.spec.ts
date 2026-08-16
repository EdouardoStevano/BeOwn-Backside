import { BadRequestException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';

/**
 * KYC validé AUTOMATIQUEMENT par Stripe Identity via le webhook
 * `/payments/webhook/stripe` (signature HMAC vérifiée par
 * StripePaymentService.constructWebhookEvent, réutilisée pour les events
 * paiement ET identity sur le même endpoint / secret).
 *
 * - `identity.verification_session.verified`   → KYC.statut = VALIDE, sans admin.
 * - `identity.verification_session.requires_input` → KYC.statut = EN_REVUE
 *   (fallback manuel) + notification utilisateur + alerte admins.
 * - Idempotent sur redélivrance du même event Stripe.
 * - Signature invalide → 400. Metadata/KYC introuvable → no-op sûr (jamais de 5xx).
 * - Machine à états (F1/F2/F3) : Stripe peut redélivrer des events Identity
 *   dans le désordre jusqu'à ~3 jours après leur émission. Chaque handler
 *   n'applique sa transition que si le statut courant fait partie des
 *   statuts amont autorisés — une décision manuelle (VALIDE/REFUSE) n'est
 *   donc JAMAIS écrasée par un event tardif/redélivré.
 */
describe('PaymentController — webhook Stripe Identity (KYC auto + fallback revue manuelle)', () => {
  let controller: PaymentController;
  let stripeService: any;
  let identityService: any;
  let stripeConnect: any;
  let updateKycStatus: any;
  let notificationService: any;
  let auditLog: any;
  let config: any;
  let kycRepository: any;
  let walletRepo: any;
  let txRepo: any;
  let dataSource: any;
  let requestRetrait: any;

  const req = (body: any) => ({ rawBody: Buffer.from(JSON.stringify(body)) }) as any;

  const stripeEvent = (type: string, session: any, id = 'evt_1') => ({
    id,
    type,
    data: { object: session },
  });

  beforeEach(() => {
    stripeService = { constructWebhookEvent: jest.fn() };
    identityService = {
      extractReportData: jest.fn().mockResolvedValue(null),
      downloadAndUploadToCloudinary: jest.fn(),
    };
    updateKycStatus = { execute: jest.fn().mockResolvedValue(undefined) };
    notificationService = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    auditLog = { create: jest.fn().mockResolvedValue(undefined) };
    stripeConnect = {
      syncAccountFromWebhook: jest.fn().mockResolvedValue({ found: false, payoutsJustEnabled: false }),
      findUserByConnectAccountId: jest.fn().mockResolvedValue(null),
      getAccountStatus: jest.fn(),
      createTransfer: jest.fn(),
      createPayoutOnConnectedAccount: jest.fn(),
      reverseTransfer: jest.fn(),
    };
    config = { get: jest.fn() };
    kycRepository = {
      findByUserId: jest.fn(),
      updateReportData: jest.fn().mockResolvedValue(undefined),
    };
    walletRepo = {};
    txRepo = { findOne: jest.fn() };
    dataSource = { transaction: jest.fn() };
    requestRetrait = { execute: jest.fn().mockResolvedValue(undefined) };

    controller = new PaymentController(
      stripeService,
      identityService,
      stripeConnect,
      updateKycStatus,
      notificationService,
      auditLog,
      config,
      kycRepository,
      walletRepo,
      txRepo,
      dataSource,
      requestRetrait,
    );
  });

  describe('identity.verification_session.verified', () => {
    it('valide automatiquement le KYC (VALIDE) sans intervention admin', async () => {
      const session = { id: 'vs_1', metadata: { userId: '42' } };
      const event = stripeEvent('identity.verification_session.verified', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.EN_COURS,
        fournisseurRef: 'vs_1',
      });

      const result = await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).toHaveBeenCalledWith(42, KycStatus.VALIDE);
      expect(notificationService.push).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateurId: 42,
          type: NotificationType.KYC_VALIDE,
          titre: 'Identité vérifiée', // pas de dingbat/emoji (règle repo)
        }),
      );
      expect(auditLog.create).toHaveBeenCalledWith(
        'stripe',
        'system',
        'kyc.auto_valide',
        'kyc',
        'kyc-1',
        undefined,
        undefined,
        expect.objectContaining({ source: 'stripe_identity', sessionId: 'vs_1' }),
      );
      expect(result).toEqual({ received: true, type: event.type, eventId: 'evt_1' });
    });

    it('est idempotent : une redélivrance du même event (déjà VALIDE pour cette session) ne renotifie pas', async () => {
      const session = { id: 'vs_1', metadata: { userId: '42' } };
      const event = stripeEvent('identity.verification_session.verified', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.VALIDE,
        fournisseurRef: 'vs_1', // même session déjà traitée
      });

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(notificationService.push).not.toHaveBeenCalled();
      expect(auditLog.create).not.toHaveBeenCalled();
    });

    it('no-op sûr si le KYC est introuvable pour cet utilisateur (pas de 5xx)', async () => {
      const session = { id: 'vs_orphan', metadata: { userId: '999' } };
      const event = stripeEvent('identity.verification_session.verified', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue(null);

      const result = await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true, type: event.type, eventId: 'evt_1' });
    });

    it('no-op sûr si userId absent des metadata de session', async () => {
      const session = { id: 'vs_no_meta', metadata: {} };
      const event = stripeEvent('identity.verification_session.verified', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);

      await controller.handleStripeWebhook('sig', req(session));

      expect(kycRepository.findByUserId).not.toHaveBeenCalled();
      expect(updateKycStatus.execute).not.toHaveBeenCalled();
    });

    it('F1 — ne réécrase PAS un refus manuel : un `verified` tardif trouvant statut=REFUSE est un no-op', async () => {
      const session = { id: 'vs_late', metadata: { userId: '42' } };
      const event = stripeEvent('identity.verification_session.verified', session, 'evt_late_verified');
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.REFUSE,
        fournisseurRef: 'vs_old', // event redélivré d'une session antérieure
      });
      const warnSpy = jest.spyOn((controller as any).logger, 'warn').mockImplementation(() => {});

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(notificationService.push).not.toHaveBeenCalled();
      expect(auditLog.create).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('evt_late_verified'),
      );
    });

    it('ne réécrase pas non plus un dossier déjà VALIDE via une autre session (statut figé)', async () => {
      const session = { id: 'vs_new_session', metadata: { userId: '42' } };
      const event = stripeEvent('identity.verification_session.verified', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.VALIDE,
        fournisseurRef: 'vs_old', // session différente de celle de l'event
      });

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(notificationService.push).not.toHaveBeenCalled();
    });

    it('valide toujours depuis EN_REVUE — retry légitime après un échec requires_input', async () => {
      const session = { id: 'vs_3', metadata: { userId: '55' } };
      const event = stripeEvent('identity.verification_session.verified', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-55',
        statut: KycStatus.EN_REVUE,
        fournisseurRef: 'vs_2', // ancienne session en échec, celle-ci a réussi
      });

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).toHaveBeenCalledWith(55, KycStatus.VALIDE);
      expect(notificationService.push).toHaveBeenCalledWith(
        expect.objectContaining({ utilisateurId: 55, type: NotificationType.KYC_VALIDE }),
      );
    });

    it.each([KycStatus.RENOUVELLEMENT, KycStatus.EXPIRE])(
      'valide depuis %s — re-vérification périodique traitée comme un nouveau départ',
      async (statut) => {
        const session = { id: 'vs_renew', metadata: { userId: '9' } };
        const event = stripeEvent('identity.verification_session.verified', session);
        stripeService.constructWebhookEvent.mockReturnValue(event);
        kycRepository.findByUserId.mockResolvedValue({
          id: 'kyc-9',
          statut,
          fournisseurRef: 'vs_prev',
        });

        await controller.handleStripeWebhook('sig', req(session));

        expect(updateKycStatus.execute).toHaveBeenCalledWith(9, KycStatus.VALIDE);
      },
    );
  });

  describe('identity.verification_session.requires_input', () => {
    it('bascule le KYC en revue manuelle (EN_REVUE) et notifie utilisateur + admins', async () => {
      const session = {
        id: 'vs_2',
        metadata: { userId: '7' },
        last_error: { reason: 'Document illisible' },
      };
      const event = stripeEvent('identity.verification_session.requires_input', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-7',
        statut: KycStatus.EN_COURS,
        fournisseurRef: 'vs_2',
      });

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).toHaveBeenCalledWith(7, KycStatus.EN_REVUE, 'Document illisible');
      expect(notificationService.push).toHaveBeenCalledWith(
        expect.objectContaining({ utilisateurId: 7, type: NotificationType.KYC_REJETE }),
      );
      expect(notificationService.pushToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: [UserRole.SUPER_ADMIN, UserRole.COMPLIANCE, UserRole.RCCI],
        }),
      );
      expect(auditLog.create).toHaveBeenCalledWith(
        'stripe',
        'system',
        'kyc.revue_manuelle_requise',
        'kyc',
        'kyc-7',
        undefined,
        undefined,
        expect.objectContaining({ source: 'stripe_identity', motif: 'Document illisible' }),
      );
    });

    it('est idempotent : une redélivrance (déjà EN_REVUE pour cette session) ne re-notifie pas', async () => {
      const session = { id: 'vs_2', metadata: { userId: '7' }, last_error: { reason: 'x' } };
      const event = stripeEvent('identity.verification_session.requires_input', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-7',
        statut: KycStatus.EN_REVUE,
        fournisseurRef: 'vs_2',
      });

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(notificationService.push).not.toHaveBeenCalled();
      expect(notificationService.pushToAdmins).not.toHaveBeenCalled();
    });

    it('F2 — ne réécrase PAS une validation manuelle : un `requires_input` après VALIDE est un no-op', async () => {
      const session = {
        id: 'vs_late2',
        metadata: { userId: '7' },
        last_error: { reason: 'stale stripe reason' },
      };
      const event = stripeEvent('identity.verification_session.requires_input', session, 'evt_late_ri_valide');
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-7',
        statut: KycStatus.VALIDE,
        fournisseurRef: 'vs_old',
      });
      const warnSpy = jest.spyOn((controller as any).logger, 'warn').mockImplementation(() => {});

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(notificationService.push).not.toHaveBeenCalled();
      expect(notificationService.pushToAdmins).not.toHaveBeenCalled();
      expect(auditLog.create).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('evt_late_ri_valide'),
      );
    });

    it('F2 — ne réécrase pas non plus un refus manuel (motifRefus admin préservé) : `requires_input` après REFUSE est un no-op', async () => {
      const session = {
        id: 'vs_late3',
        metadata: { userId: '7' },
        last_error: { reason: 'stale stripe reason overwriting admin motif' },
      };
      const event = stripeEvent('identity.verification_session.requires_input', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-7',
        statut: KycStatus.REFUSE,
        fournisseurRef: 'vs_old',
      });

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(notificationService.push).not.toHaveBeenCalled();
      expect(notificationService.pushToAdmins).not.toHaveBeenCalled();
    });

    it.each([KycStatus.RENOUVELLEMENT, KycStatus.EXPIRE])(
      'bascule en EN_REVUE depuis %s — re-vérification périodique traitée comme un nouveau départ',
      async (statut) => {
        const session = {
          id: 'vs_renew2',
          metadata: { userId: '9' },
          last_error: { reason: 'doc illisible' },
        };
        const event = stripeEvent('identity.verification_session.requires_input', session);
        stripeService.constructWebhookEvent.mockReturnValue(event);
        kycRepository.findByUserId.mockResolvedValue({
          id: 'kyc-9',
          statut,
          fournisseurRef: 'vs_prev',
        });

        await controller.handleStripeWebhook('sig', req(session));

        expect(updateKycStatus.execute).toHaveBeenCalledWith(9, KycStatus.EN_REVUE, 'doc illisible');
      },
    );
  });

  describe('identity.verification_session.processing', () => {
    it('passe le KYC en EN_COURS (photos reçues) depuis NON_DEMARRE', async () => {
      const session = { id: 'vs_4', metadata: { userId: '3' } };
      const event = stripeEvent('identity.verification_session.processing', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-3',
        statut: KycStatus.NON_DEMARRE,
        fournisseurRef: null,
      });

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).toHaveBeenCalledWith(3, KycStatus.EN_COURS);
    });

    it('est idempotent si déjà EN_COURS (no-op existant)', async () => {
      const session = { id: 'vs_4', metadata: { userId: '3' } };
      const event = stripeEvent('identity.verification_session.processing', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-3',
        statut: KycStatus.EN_COURS,
        fournisseurRef: 'vs_4',
      });

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
    });

    it('F3 — ne démote PAS un dossier VALIDE : un `processing` tardif après VALIDE est un no-op', async () => {
      const session = { id: 'vs_late4', metadata: { userId: '3' } };
      const event = stripeEvent('identity.verification_session.processing', session, 'evt_late_processing');
      stripeService.constructWebhookEvent.mockReturnValue(event);
      kycRepository.findByUserId.mockResolvedValue({
        id: 'kyc-3',
        statut: KycStatus.VALIDE,
        fournisseurRef: 'vs_old',
      });
      const warnSpy = jest.spyOn((controller as any).logger, 'warn').mockImplementation(() => {});

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('evt_late_processing'),
      );
    });

    it.each([KycStatus.EN_REVUE, KycStatus.REFUSE])(
      'ne dégrade pas non plus un dossier %s (revue en cours / décision manuelle)',
      async (statut) => {
        const session = { id: 'vs_late5', metadata: { userId: '3' } };
        const event = stripeEvent('identity.verification_session.processing', session);
        stripeService.constructWebhookEvent.mockReturnValue(event);
        kycRepository.findByUserId.mockResolvedValue({
          id: 'kyc-3',
          statut,
          fournisseurRef: 'vs_old',
        });

        await controller.handleStripeWebhook('sig', req(session));

        expect(updateKycStatus.execute).not.toHaveBeenCalled();
      },
    );

    it.each([KycStatus.RENOUVELLEMENT, KycStatus.EXPIRE])(
      'passe en EN_COURS depuis %s — re-vérification périodique traitée comme un nouveau départ',
      async (statut) => {
        const session = { id: 'vs_renew3', metadata: { userId: '9' } };
        const event = stripeEvent('identity.verification_session.processing', session);
        stripeService.constructWebhookEvent.mockReturnValue(event);
        kycRepository.findByUserId.mockResolvedValue({
          id: 'kyc-9',
          statut,
          fournisseurRef: 'vs_prev',
        });

        await controller.handleStripeWebhook('sig', req(session));

        expect(updateKycStatus.execute).toHaveBeenCalledWith(9, KycStatus.EN_COURS);
      },
    );
  });

  describe('signature invalide', () => {
    it('rejette (400) sans traiter aucun event', async () => {
      stripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('signature mismatch');
      });

      await expect(
        controller.handleStripeWebhook('bad-sig', req({ foo: 'bar' })),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
    });
  });
});
