import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_IDENTITY_SERVICE = Symbol('STRIPE_IDENTITY_SERVICE');

export interface VerificationSessionResult {
  sessionId: string;
  url: string;
  status: string;
}

export interface StripeIdentityService {
  createVerificationSession(
    userId: number,
    email: string,
  ): Promise<VerificationSessionResult>;
  retrieveVerificationSession(
    sessionId: string,
  ): Promise<VerificationSessionResult>;
  cancelVerificationSession(sessionId: string): Promise<void>;
}

@Injectable()
export class StripeIdentityServiceImpl implements StripeIdentityService {
  private readonly stripe: any;
  private readonly logger = new Logger(StripeIdentityServiceImpl.name);

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(config.getOrThrow('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-04-22.dahlia',
    });
  }

  async createVerificationSession(
    userId: number,
    email: string,
  ): Promise<VerificationSessionResult> {
    const session = await this.stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { userId: String(userId), email },
      options: {
        document: {
          require_matching_selfie: true,
          allowed_types: ['id_card', 'passport', 'driving_license'],
        },
      },
      return_url: `${this.config.get('FRONTEND_URL')}/kyc/callback`,
    });

    return {
      sessionId: session.id,
      url: session.url!,
      status: session.status,
    };
  }

  async retrieveVerificationSession(
    sessionId: string,
  ): Promise<VerificationSessionResult> {
    const session =
      await this.stripe.identity.verificationSessions.retrieve(sessionId);
    return {
      sessionId: session.id,
      url: session.url ?? '',
      status: session.status,
    };
  }

  async cancelVerificationSession(sessionId: string): Promise<void> {
    await this.stripe.identity.verificationSessions.cancel(sessionId);
  }
}
