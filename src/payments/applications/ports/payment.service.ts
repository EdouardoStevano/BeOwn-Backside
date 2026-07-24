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
