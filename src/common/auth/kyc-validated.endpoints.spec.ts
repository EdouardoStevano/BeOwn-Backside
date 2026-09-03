/**
 * Vérifie par réflexion que KycValidatedGuard est appliqué sur toutes les
 * actions financières mutantes (dépôt, investissement, marché secondaire,
 * retrait) — et n'est PAS appliqué sur les routes de consultation, afin que
 * les profils non validés puissent continuer à naviguer librement.
 */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { KycValidatedGuard } from './kyc-validated.guard';
import { PaymentController } from 'src/payments/presenters/http/payment.controller';
import { PayoutMethodsController } from 'src/payments/presenters/http/payout-methods.controller';
import { InvestmentController } from 'src/investments/presenters/http/investment.controller';
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
      // Le parcours KYC lui-même doit rester accessible à un profil non validé
      ['startKyc'],
      ['getMyKycImages'],
      ['getKycSession'],
      ['cancelKycSession'],
      // Webhook Stripe : public, jamais gaté
      ['handleStripeWebhook'],
    ])('ne gate pas %s', (method) => {
      expect(hasKycGuard(PaymentController, method)).toBe(false);
    });
  });

  describe('PayoutMethodsController', () => {
    it('gate TOUTES les routes au niveau de la classe (destinations de retrait)', () => {
      // Gérer une destination de retrait est une action financière : le garde
      // est posé sur la classe, donc appliqué à chacune des cinq routes.
      const guards =
        Reflect.getMetadata(GUARDS_METADATA, PayoutMethodsController) ?? [];
      expect(guards).toContain(KycValidatedGuard);
    });
  });

  describe('InvestmentController', () => {
    it.each([
      ['create', 'POST /investments'],
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
      // Débranché en 410 INVESTMENT_INITIATE_DISABLED : le stub ne lit aucune
      // donnée et ne déclenche rien — gater un tombeau n'aurait pas de sens,
      // et le garde masquerait le 410 (le client verrait un 403 trompeur).
      ['initiateWithYouSign'],
    ])('ne gate pas %s (consultation/admin)', (method) => {
      expect(hasKycGuard(InvestmentController, method)).toBe(false);
    });
  });

  describe('SecondaryMarketController', () => {
    it.each([
      ['createOrder', 'POST /secondary-market/orders'],
      ['executeOrder', 'POST /secondary-market/orders/:id/execute'],
      // Art. 25 : l'achat sur le tableau d'affichage passe par une marque
      // d'intérêt puis l'acceptation du vendeur — les deux sont des actions
      // financières et restent donc gatées par le KYC.
      ['exprimerInteret', 'POST /secondary-market/orders/:id/interet'],
      ['accepterInteret', 'POST /secondary-market/orders/:id/interet/acceptation'],
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
