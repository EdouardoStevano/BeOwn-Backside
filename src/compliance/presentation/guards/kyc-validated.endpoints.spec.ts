/**
 * Vérifie par réflexion que KycValidatedGuard est appliqué sur toutes les
 * actions financières mutantes (dépôt, investissement, marché secondaire,
 * retrait) — et n'est PAS appliqué sur les routes de consultation, afin que
 * les profils non validés puissent continuer à naviguer librement.
 */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { KycValidatedGuard } from './kyc-validated.guard';
import { KycController } from '../http/kyc.controller';
import {
  KycLegacyPaymentsController,
  KycLegacyProfilesController,
} from '../http/kyc-legacy.controller';
import { PaymentController } from 'src/payments/presenters/http/payment.controller';
import { InvestmentController } from 'src/subscription/presentation/http/investment.controller';
import { SecondaryMarketController } from 'src/secondarymarket/presenters/http/secondary-market.controller';

type ControllerClass = new (...args: any[]) => unknown;

const guardsOf = (controller: ControllerClass, method: string): unknown[] =>
  Reflect.getMetadata(GUARDS_METADATA, controller.prototype[method]) ?? [];

const hasKycGuard = (controller: ControllerClass, method: string): boolean =>
  guardsOf(controller, method).includes(KycValidatedGuard);

describe('KycValidatedGuard — application aux actions financières', () => {
  describe('PaymentController', () => {
    it.each([
      ['createDepotIntent', 'POST /payments/depot/intent'],
      ['confirmDepot', 'POST /payments/depot/confirm'],
      ['createRetrait', 'POST /payments/retrait'],
    ])('gate %s (%s)', (method) => {
      expect(hasKycGuard(PaymentController, method)).toBe(true);
    });

    it.each([
      // Webhook Stripe : public, jamais gaté
      ['handleStripeWebhook'],
      // Stripe Connect : configurer son compte de retrait n'exige pas encore
      // un dossier validé — seul le retrait lui-même l'exige.
      ['connectOnboardingLink'],
      ['connectStatus'],
    ])('ne gate pas %s', (method) => {
      expect(hasKycGuard(PaymentController, method)).toBe(false);
    });
  });

  /**
   * Le parcours KYC lui-même doit rester accessible à un profil non validé —
   * le gater rendrait la vérification d'identité impossible à quiconque ne l'a
   * pas déjà passée. La règle vaut pour les trois contrôleurs du contexte, y
   * compris le shim des anciennes URLs.
   */
  describe.each([
    [
      'KycController',
      KycController as ControllerClass,
      [
        'initKyc',
        'getMyKyc',
        'listAllKyc',
        'requestManualReview',
        'patchKycStatus',
        'startKyc',
        'getKycSession',
        'cancelKycSession',
        'getMyKycImages',
        'getKycImagesForUser',
      ],
    ],
    [
      'KycLegacyProfilesController',
      KycLegacyProfilesController as ControllerClass,
      [
        'initKyc',
        'getMyKyc',
        'listAllKyc',
        'requestManualReview',
        'patchKycStatus',
      ],
    ],
    [
      'KycLegacyPaymentsController',
      KycLegacyPaymentsController as ControllerClass,
      [
        'startKyc',
        'getMyKycImages',
        'getKycImagesForUser',
        'getKycSession',
        'cancelKycSession',
      ],
    ],
  ])('%s', (_nom, controller, methodes) => {
    it.each(methodes.map((m) => [m]))('ne gate pas %s', (method) => {
      expect(hasKycGuard(controller, method)).toBe(false);
    });
  });

  describe('InvestmentController', () => {
    it.each([
      ['create', 'POST /investments'],
      ['initiateWithYouSign', 'POST /investments/initiate'],
      ['topUp', 'PATCH /investments/:id/top-up'],
    ])('gate %s (%s)', (method) => {
      expect(hasKycGuard(InvestmentController, method)).toBe(true);
    });

    it.each([
      ['listByUser'],
      ['listByProject'],
      ['findOne'],
      ['getSchedule'],
      ['getMyPortfolio'],
      ['getMyRoi'],
      ['getMyFiscalSummary'],
      // Rétractation légale : doit rester possible même si le KYC a expiré entre-temps
      ['retract'],
      // Route admin : gérée par @RequirePermission, pas par le KYC investisseur
      ['patchStatus'],
    ])('ne gate pas %s (consultation/admin)', (method) => {
      expect(hasKycGuard(InvestmentController, method)).toBe(false);
    });
  });

  describe('SecondaryMarketController', () => {
    it.each([
      ['createOrder', 'POST /secondary-market/orders'],
      ['executeOrder', 'POST /secondary-market/orders/:id/execute'],
      ['initiateBuy', 'POST /secondary-market/orders/:id/initiate-buy'],
    ])('gate %s (%s)', (method) => {
      expect(hasKycGuard(SecondaryMarketController, method)).toBe(true);
    });

    it.each([
      ['listOrders'],
      ['myOrders'],
      // Annulations : retirer une annonce ou une initiation reste permis
      ['cancelOrder'],
      ['cancelInitiation'],
      ['signaturesForInvestment'],
      ['signatureStatus'],
    ])('ne gate pas %s (consultation/annulation)', (method) => {
      expect(hasKycGuard(SecondaryMarketController, method)).toBe(false);
    });
  });
});
