import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type {
  PaymentService,
  CreatePaymentIntentParams,
  PaymentIntentResult,
} from '../applications/ports/payment.service';

@Injectable()
export class StripePaymentService implements PaymentService {
  private readonly stripe: any;
  private readonly logger = new Logger(StripePaymentService.name);

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(config.getOrThrow('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-04-22.dahlia',
    });
  }

  async createPaymentIntent(
    params: CreatePaymentIntentParams,
  ): Promise<PaymentIntentResult> {
    const intent = await this.stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100),
      currency: params.currency.toLowerCase(),
      metadata: {
        userId: String(params.userId),
        ...params.metadata,
      },
      automatic_payment_methods: { enabled: true },
    });

    return {
      clientSecret: intent.client_secret!,
      intentId: intent.id,
      status: intent.status,
    };
  }

  async retrievePaymentIntent(intentId: string): Promise<PaymentIntentResult> {
    const intent = await this.stripe.paymentIntents.retrieve(intentId);
    return {
      clientSecret: intent.client_secret!,
      intentId: intent.id,
      status: intent.status,
    };
  }

  async createRefund(chargeId: string, amount?: number): Promise<void> {
    await this.stripe.refunds.create({
      charge: chargeId,
      ...(amount ? { amount: Math.round(amount * 100) } : {}),
    });
  }

  constructWebhookEvent(payload: Buffer, signature: string): unknown {
    const secret = this.config.getOrThrow('STRIPE_WEBHOOK_SECRET');
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
