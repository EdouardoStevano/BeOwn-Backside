import { BadRequestException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

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
 */
describe('PaymentController — webhook Stripe Identity (KYC auto + fallback revue manuelle)', () => {
  let controller: PaymentController;
  let stripeService: any;
  let identityService: any;
  let updateKycStatus: any;
  let notificationService: any;
  let auditLog: any;
  let profilRepository: any;
  let walletRepo: any;
  let txRepo: any;

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
    profilRepository = {
      findKycByUserId: jest.fn(),
      updateKycReportData: jest.fn().mockResolvedValue(undefined),
    };
    walletRepo = {};
    txRepo = { findOne: jest.fn() };

    controller = new PaymentController(
      stripeService,
      identityService,
      updateKycStatus,
      notificationService,
      auditLog,
      profilRepository,
      walletRepo,
      txRepo,
    );
  });

  describe('identity.verification_session.verified', () => {
    it('valide automatiquement le KYC (VALIDE) sans intervention admin', async () => {
      const session = { id: 'vs_1', metadata: { userId: '42' } };
      const event = stripeEvent('identity.verification_session.verified', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);
      profilRepository.findKycByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.EN_COURS,
        fournisseurRef: 'vs_1',
      });

      const result = await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).toHaveBeenCalledWith(42, KycStatus.VALIDE);
      expect(notificationService.push).toHaveBeenCalledWith(
        expect.objectContaining({ utilisateurId: 42, type: NotificationType.KYC_VALIDE }),
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
      profilRepository.findKycByUserId.mockResolvedValue({
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
      profilRepository.findKycByUserId.mockResolvedValue(null);

      const result = await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true, type: event.type, eventId: 'evt_1' });
    });

    it('no-op sûr si userId absent des metadata de session', async () => {
      const session = { id: 'vs_no_meta', metadata: {} };
      const event = stripeEvent('identity.verification_session.verified', session);
      stripeService.constructWebhookEvent.mockReturnValue(event);

      await controller.handleStripeWebhook('sig', req(session));

      expect(profilRepository.findKycByUserId).not.toHaveBeenCalled();
      expect(updateKycStatus.execute).not.toHaveBeenCalled();
    });
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
      profilRepository.findKycByUserId.mockResolvedValue({
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
      profilRepository.findKycByUserId.mockResolvedValue({
        id: 'kyc-7',
        statut: KycStatus.EN_REVUE,
        fournisseurRef: 'vs_2',
      });

      await controller.handleStripeWebhook('sig', req(session));

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
      expect(notificationService.push).not.toHaveBeenCalled();
      expect(notificationService.pushToAdmins).not.toHaveBeenCalled();
    });
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
