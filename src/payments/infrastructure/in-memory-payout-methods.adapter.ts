import { Injectable } from '@nestjs/common';
import {
  InstantBalanceView,
  PayoutMethodError,
  PayoutMethodView,
  PayoutMethodsReader,
  PayoutMethodsWriter,
} from '../applications/ports/payout-methods.port';

/**
 * Implémentation EN MÉMOIRE des ports « destinations de retrait ».
 *
 * LSP — elle honore exactement le même contrat que `StripePayoutMethodsService`
 * et les deux sont validées par la même suite de tests
 * (`payout-methods.contract.spec.ts`). C'est ce qui rend le chemin retrait
 * testable sans clé Stripe ni réseau.
 *
 * ⚠ Non branchée en production : réservée aux tests et à un usage local. Elle
 * conserve un état en mémoire de processus et ne doit donc JAMAIS être fournie
 * dans un module servant du trafic (contrainte stateless).
 */
@Injectable()
export class InMemoryPayoutMethodsAdapter
  implements PayoutMethodsReader, PayoutMethodsWriter
{
  private readonly byAccount = new Map<string, PayoutMethodView[]>();
  private readonly balances = new Map<string, InstantBalanceView>();
  private sequence = 0;

  /** Refus simulé du prochain `attachCard` (test du chemin CARD_REJECTED). */
  private nextAttachRejection: string | null = null;

  // ─── Lecture ──────────────────────────────────────────────────────────────

  async list(connectedAccountId: string): Promise<PayoutMethodView[]> {
    const methods = [...(this.byAccount.get(connectedAccountId) ?? [])];
    return methods.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }

  async find(
    connectedAccountId: string,
    payoutMethodId: string,
  ): Promise<PayoutMethodView | null> {
    const methods = this.byAccount.get(connectedAccountId) ?? [];
    return methods.find((m) => m.id === payoutMethodId) ?? null;
  }

  async getInstantBalance(
    connectedAccountId: string,
  ): Promise<InstantBalanceView> {
    return (
      this.balances.get(connectedAccountId) ?? {
        available: 0,
        instantAvailable: 0,
        currency: 'EUR',
      }
    );
  }

  // ─── Écriture ─────────────────────────────────────────────────────────────

  async attachCard(
    connectedAccountId: string,
    token: string,
  ): Promise<PayoutMethodView> {
    if (this.nextAttachRejection) {
      const message = this.nextAttachRejection;
      this.nextAttachRejection = null;
      throw new PayoutMethodError('CARD_REJECTED', message);
    }
    const methods = this.byAccount.get(connectedAccountId) ?? [];
    this.sequence += 1;
    const created: PayoutMethodView = {
      id: `card_mem_${this.sequence}`,
      type: 'card',
      brand: 'visa',
      last4: token.slice(-4).padStart(4, '0'),
      expMonth: 12,
      expYear: new Date().getFullYear() + 3,
      // Première destination enregistrée = destination par défaut.
      isDefault: methods.length === 0,
      instantEligible: true,
      currency: 'EUR',
      country: 'FR',
    };
    this.byAccount.set(connectedAccountId, [...methods, created]);
    return created;
  }

  async detach(
    connectedAccountId: string,
    payoutMethodId: string,
  ): Promise<void> {
    const methods = this.byAccount.get(connectedAccountId) ?? [];
    const target = methods.find((m) => m.id === payoutMethodId);
    if (!target) {
      throw new PayoutMethodError(
        'NO_PAYOUT_METHOD',
        'Cette destination de retrait est introuvable.',
      );
    }
    if (target.isDefault && methods.length > 1) {
      throw new PayoutMethodError(
        'CANNOT_DELETE_DEFAULT',
        'Désignez une autre destination par défaut avant de supprimer celle-ci.',
      );
    }
    this.byAccount.set(
      connectedAccountId,
      methods.filter((m) => m.id !== payoutMethodId),
    );
  }

  async setDefault(
    connectedAccountId: string,
    payoutMethodId: string,
  ): Promise<PayoutMethodView> {
    const methods = this.byAccount.get(connectedAccountId) ?? [];
    if (!methods.some((m) => m.id === payoutMethodId)) {
      throw new PayoutMethodError(
        'NO_PAYOUT_METHOD',
        'Cette destination de retrait est introuvable.',
      );
    }
    const updated = methods.map((m) => ({
      ...m,
      isDefault: m.id === payoutMethodId,
    }));
    this.byAccount.set(connectedAccountId, updated);
    return updated.find((m) => m.id === payoutMethodId)!;
  }

  // ─── Utilitaires de test (hors contrat des ports) ─────────────────────────

  /** Injecte une destination arbitraire (ex. carte non éligible à l'instantané). */
  seed(connectedAccountId: string, method: PayoutMethodView): void {
    const methods = this.byAccount.get(connectedAccountId) ?? [];
    this.byAccount.set(connectedAccountId, [...methods, method]);
  }

  setBalance(connectedAccountId: string, balance: InstantBalanceView): void {
    this.balances.set(connectedAccountId, balance);
  }

  rejectNextAttach(message: string): void {
    this.nextAttachRejection = message;
  }

  reset(): void {
    this.byAccount.clear();
    this.balances.clear();
    this.nextAttachRejection = null;
    this.sequence = 0;
  }
}
