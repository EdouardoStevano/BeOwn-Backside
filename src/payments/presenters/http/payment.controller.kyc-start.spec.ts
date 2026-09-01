import { ConflictException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';

/**
 * POST /payments/kyc/start — ouverture d'une session Stripe Identity.
 *
 * Régression constatée en développement le 07/08/2026 : l'endpoint écrasait le
 * statut du dossier avec NON_DEMARRE sans regarder sa valeur courante. Comme le
 * front appelait cet endpoint au montage du composant de vérification, un KYC
 * passé VALIDE par le webhook `identity.verification_session.verified` était
 * rétrogradé au simple réaffichage de la page — la validation était perdue et
 * l'utilisateur revoyait « KYC non démarré ».
 *
 * Invariant posé ici : ouvrir une session ne décide JAMAIS du statut. Seuls les
 * webhooks Stripe et les décisions admin le font. Les états terminaux (VALIDE,
 * REFUSE) refusent même l'ouverture — aucun event ultérieur ne pourrait leur
 * être appliqué, la machine à états ne les listant dans aucun `*_ALLOWED_FROM`.
 */
describe('PaymentController — POST /payments/kyc/start', () => {
  let controller: PaymentController;
  let identityService: any;
  let profilRepository: any;

  const user = { userId: 12, email: 'test@example.com' } as any;

  const buildController = () => {
    identityService = {
      createVerificationSession: jest.fn().mockResolvedValue({
        sessionId: 'vs_new',
        url: 'https://verify.stripe.com/start/new',
        status: 'requires_input',
      }),
    };
    profilRepository = {
      findKycByUserId: jest.fn(),
      saveKyc: jest.fn((k: any) => Promise.resolve({ ...k, id: 'kyc-new' })),
      updateKycSession: jest.fn().mockResolvedValue(undefined),
    };

    return new PaymentController(
      /* stripeService */ { constructWebhookEvent: jest.fn() } as any,
      identityService,
      /* stripeConnect */ {} as any,
      /* updateKycStatus */ { execute: jest.fn() } as any,
      /* notificationService */ { push: jest.fn(), pushToAdmins: jest.fn() } as any,
      /* auditLog */ { create: jest.fn() } as any,
      /* config */ { get: jest.fn() } as any,
      profilRepository,
      /* walletRepo */ {} as any,
      /* txRepo */ {} as any,
      /* projectRepo */ { findOne: jest.fn().mockResolvedValue(null) } as any,
      /* dataSource */ {} as any,
      /* requestRetrait */ {} as any,
      /* crediterApportPorteur */ { execute: jest.fn() } as any,
      /* metrics */ {
        incrementCounter: jest.fn(),
        observeHistogram: jest.fn(),
        setGauge: jest.fn(),
      } as any,
      /* transactionalEmails */ {
        depotConfirme: jest.fn().mockResolvedValue(undefined),
        retraitExecute: jest.fn().mockResolvedValue(undefined),
        kycValide: jest.fn().mockResolvedValue(undefined),
        kycRefuse: jest.fn().mockResolvedValue(undefined),
      } as any,
      /* amlMonitor */ { check: jest.fn().mockResolvedValue(undefined) } as any,
      /* retraitSettlement */ {} as any,
    );
  };

  beforeEach(() => {
    controller = buildController();
  });

  describe('états terminaux — la validation acquise est protégée', () => {
    it('refuse (409) de rouvrir une session sur un KYC VALIDE et ne touche pas au dossier', async () => {
      profilRepository.findKycByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.VALIDE,
        fournisseurRef: 'vs_verified',
      });

      await expect(controller.startKyc(user)).rejects.toBeInstanceOf(
        ConflictException,
      );

      // Le cœur de la régression : aucune écriture, aucun appel Stripe.
      expect(profilRepository.updateKycSession).not.toHaveBeenCalled();
      expect(identityService.createVerificationSession).not.toHaveBeenCalled();
    });

    it('refuse (409) sur un KYC REFUSE — décision admin définitive', async () => {
      profilRepository.findKycByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.REFUSE,
        fournisseurRef: 'vs_old',
      });

      await expect(controller.startKyc(user)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(profilRepository.updateKycSession).not.toHaveBeenCalled();
    });
  });

  describe('états ouverts — la session est créée sans écraser le statut', () => {
    it('démarre depuis NON_DEMARRE en conservant NON_DEMARRE', async () => {
      profilRepository.findKycByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.NON_DEMARRE,
        fournisseurRef: null,
      });

      const res = await controller.startKyc(user);

      expect(res.url).toBe('https://verify.stripe.com/start/new');
      expect(profilRepository.updateKycSession).toHaveBeenCalledWith(
        'kyc-1',
        'vs_new',
        KycStatus.NON_DEMARRE,
      );
    });

    it('conserve EN_REVUE lors d’un retry Stripe après échec', async () => {
      profilRepository.findKycByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.EN_REVUE,
        fournisseurRef: 'vs_failed',
      });

      await controller.startKyc(user);

      // Rétrograder effacerait le fallback manuel en cours côté admin.
      expect(profilRepository.updateKycSession).toHaveBeenCalledWith(
        'kyc-1',
        'vs_new',
        KycStatus.EN_REVUE,
      );
    });

    it('conserve EXPIRE lors d’un renouvellement', async () => {
      profilRepository.findKycByUserId.mockResolvedValue({
        id: 'kyc-1',
        statut: KycStatus.EXPIRE,
        fournisseurRef: 'vs_old',
      });

      await controller.startKyc(user);

      expect(profilRepository.updateKycSession).toHaveBeenCalledWith(
        'kyc-1',
        'vs_new',
        KycStatus.EXPIRE,
      );
    });

    it('crée le dossier absent puis démarre en NON_DEMARRE', async () => {
      profilRepository.findKycByUserId.mockResolvedValue(null);

      await controller.startKyc(user);

      expect(profilRepository.saveKyc).toHaveBeenCalled();
      expect(profilRepository.updateKycSession).toHaveBeenCalledWith(
        'kyc-new',
        'vs_new',
        KycStatus.NON_DEMARRE,
      );
    });
  });
});
