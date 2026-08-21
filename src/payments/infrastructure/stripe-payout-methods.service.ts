import { Injectable, Logger } from '@nestjs/common';
import { StripePaymentService } from './stripe-payment.service';
import {
  InstantBalanceView,
  PayoutMethodError,
  PayoutMethodView,
  PayoutMethodsReader,
  PayoutMethodsWriter,
} from '../applications/ports/payout-methods.port';

/**
 * Adaptateur Stripe des ports `PayoutMethodsReader` / `PayoutMethodsWriter`
 * (Lot 4a — retrait par carte / versement instantané).
 *
 * SRP : `StripeConnectService` reste responsable du CYCLE DE VIE du compte
 * connecté (création, onboarding, transfer, payout, reversal) ; la gestion des
 * DESTINATIONS de retrait (external accounts) vit ici, dans sa propre classe.
 *
 * ADR-2 : aucun cache local. Chaque lecture interroge Stripe, seule source de
 * vérité de `default_for_currency` et `available_payout_methods`. Dette assumée :
 * une latence réseau par consultation.
 *
 * SÉCURITÉ : le backend ne manipule que des tokens `tok_...` produits par
 * Stripe.js côté client. Aucun PAN, aucun CVC ne transite ni n'est journalisé —
 * les logs ne contiennent que des identifiants Stripe.
 *
 * Réutilise le client Stripe instancié une seule fois dans
 * `StripePaymentService` (clés configurées à un seul endroit).
 */
@Injectable()
export class StripePayoutMethodsService
  implements PayoutMethodsReader, PayoutMethodsWriter
{
  private readonly logger = new Logger(StripePayoutMethodsService.name);

  constructor(private readonly stripePayment: StripePaymentService) {}

  /** Client Stripe partagé (typé `any`, comme le reste du module Stripe). */
  private get stripe(): any {
    return this.stripePayment.client;
  }

  // ─── Lecture ──────────────────────────────────────────────────────────────

  async list(connectedAccountId: string): Promise<PayoutMethodView[]> {
    const page = await this.stripe.accounts.listExternalAccounts(
      connectedAccountId,
      { limit: 100 },
    );
    const views: PayoutMethodView[] = (page?.data ?? []).map(
      StripePayoutMethodsService.toView,
    );
    // Destination par défaut en tête : le front affiche toujours la même en
    // premier, indépendamment de l'ordre de création renvoyé par Stripe.
    return views.sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault),
    );
  }

  async find(
    connectedAccountId: string,
    payoutMethodId: string,
  ): Promise<PayoutMethodView | null> {
    try {
      const external = await this.stripe.accounts.retrieveExternalAccount(
        connectedAccountId,
        payoutMethodId,
      );
      return StripePayoutMethodsService.toView(external);
    } catch (err: any) {
      // Anti-IDOR : Stripe répond `resource_missing` pour une destination qui
      // n'appartient pas au compte connecté (comportement vérifié en sonde).
      if (StripePayoutMethodsService.isMissing(err)) return null;
      throw err;
    }
  }

  async getInstantBalance(
    connectedAccountId: string,
  ): Promise<InstantBalanceView> {
    const balance = await this.stripe.balance.retrieve(
      { expand: ['instant_available'] },
      { stripeAccount: connectedAccountId },
    );
    return {
      available: StripePayoutMethodsService.sumEur(balance?.available),
      instantAvailable: StripePayoutMethodsService.sumEur(
        balance?.instant_available,
      ),
      currency: 'EUR',
    };
  }

  // ─── Écriture ─────────────────────────────────────────────────────────────

  async attachCard(
    connectedAccountId: string,
    token: string,
  ): Promise<PayoutMethodView> {
    try {
      const external = await this.stripe.accounts.createExternalAccount(
        connectedAccountId,
        { external_account: token },
      );
      this.logger.log(
        `Destination de retrait ajoutée: account=${connectedAccountId} external=${external?.id}`,
      );
      return StripePayoutMethodsService.toView(external);
    } catch (err: any) {
      // Le motif Stripe reste dans les logs ; l'utilisateur reçoit un message
      // générique en français, sans détail technique exploitable.
      this.logger.warn(
        `Ajout de destination refusé: account=${connectedAccountId} ` +
          `code=${err?.code ?? 'n/a'} type=${err?.type ?? 'n/a'} message=${err?.message ?? 'n/a'}`,
      );
      throw new PayoutMethodError(
        'CARD_REJECTED',
        StripePayoutMethodsService.rejectionMessage(err),
      );
    }
  }

  async detach(
    connectedAccountId: string,
    payoutMethodId: string,
  ): Promise<void> {
    try {
      await this.stripe.accounts.deleteExternalAccount(
        connectedAccountId,
        payoutMethodId,
      );
      this.logger.log(
        `Destination de retrait supprimée: account=${connectedAccountId} external=${payoutMethodId}`,
      );
    } catch (err: any) {
      if (StripePayoutMethodsService.isMissing(err)) {
        throw new PayoutMethodError(
          'NO_PAYOUT_METHOD',
          'Cette destination de retrait est introuvable.',
        );
      }
      // Stripe refuse de supprimer la destination par défaut de la devise
      // (message vérifié en sonde) : on le traduit en code métier stable.
      if (StripePayoutMethodsService.isDefaultDeletionRefusal(err)) {
        throw new PayoutMethodError(
          'CANNOT_DELETE_DEFAULT',
          'Désignez une autre destination par défaut avant de supprimer celle-ci.',
        );
      }
      throw err;
    }
  }

  async setDefault(
    connectedAccountId: string,
    payoutMethodId: string,
  ): Promise<PayoutMethodView> {
    try {
      const external = await this.stripe.accounts.updateExternalAccount(
        connectedAccountId,
        payoutMethodId,
        { default_for_currency: true },
      );
      return StripePayoutMethodsService.toView(external);
    } catch (err: any) {
      if (StripePayoutMethodsService.isMissing(err)) {
        throw new PayoutMethodError(
          'NO_PAYOUT_METHOD',
          'Cette destination de retrait est introuvable.',
        );
      }
      throw err;
    }
  }

  // ─── Mapping / helpers ────────────────────────────────────────────────────

  /**
   * Modèle Stripe → vue d'API. Le mapping est explicite : le front ne voit
   * jamais la forme brute d'un external account Stripe.
   */
  private static toView(external: any): PayoutMethodView {
    const isCard = external?.object === 'card';
    const methods: unknown = external?.available_payout_methods;
    return {
      id: external?.id,
      type: isCard ? 'card' : 'bank_account',
      brand: (isCard ? external?.brand : external?.bank_name) ?? null,
      last4: external?.last4 ?? null,
      expMonth: isCard ? (external?.exp_month ?? null) : null,
      expYear: isCard ? (external?.exp_year ?? null) : null,
      isDefault: !!external?.default_for_currency,
      instantEligible: Array.isArray(methods) && methods.includes('instant'),
      currency: String(external?.currency ?? 'eur').toUpperCase(),
      country: external?.country ?? null,
    };
  }

  /** Somme des soldes EUR d'un tableau Stripe (centimes) → euros. */
  private static sumEur(buckets: unknown): number {
    if (!Array.isArray(buckets)) return 0;
    const minor = buckets
      .filter((b: any) => String(b?.currency).toLowerCase() === 'eur')
      .reduce((sum: number, b: any) => sum + Number(b?.amount ?? 0), 0);
    return minor / 100;
  }

  private static isMissing(err: any): boolean {
    return (err?.code ?? err?.raw?.code) === 'resource_missing';
  }

  private static isDefaultDeletionRefusal(err: any): boolean {
    return /default external account/i.test(String(err?.message ?? ''));
  }

  /**
   * Message utilisateur pour un refus d'ajout de destination. On distingue le
   * seul cas actionnable (versement instantané indisponible pour cette carte)
   * du refus générique — sans jamais recopier le texte technique de Stripe.
   */
  private static rejectionMessage(err: any): string {
    const code = err?.code ?? err?.raw?.code;
    if (code === 'instant_payouts_unsupported') {
      return (
        'Cette carte n\'est pas éligible au virement instantané. ' +
        'Utilisez une carte de débit émise dans la zone euro.'
      );
    }
    return 'Cette carte a été refusée. Vérifiez ses informations ou utilisez une autre carte.';
  }
}
