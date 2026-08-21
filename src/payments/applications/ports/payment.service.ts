export const PAYMENT_SERVICE = Symbol('PAYMENT_SERVICE');

export interface CreatePaymentIntentParams {
  amount: number;
  currency: string;
  userId: number;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  clientSecret: string;
  intentId: string;
  status: string;
  /** Amount in the currency's smallest unit (e.g. cents for EUR/USD) */
  amount: number;
  /** Code devise ISO 4217 en minuscules tel que retourné par Stripe (ex. 'eur').
   *  Requis pour refuser tout dépôt en devise ≠ EUR avant crédit : le crédit du
   *  wallet est toujours libellé en EUR (`amount / 100`), une autre devise
   *  sur-créditerait le solde (C-2). */
  currency?: string;
  /** Metadata Stripe (contient notamment userId/operationType) — requis pour
   *  vérifier la propriété du PaymentIntent avant tout crédit (anti-BOLA). */
  metadata?: Record<string, string>;
}

export interface PaymentService {
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;
  retrievePaymentIntent(intentId: string): Promise<PaymentIntentResult>;
  createRefund(chargeId: string, amount?: number): Promise<void>;
  constructWebhookEvent(payload: Buffer, signature: string): unknown;
}
