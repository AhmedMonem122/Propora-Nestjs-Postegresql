import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type {
  CheckoutInput,
  CheckoutSession,
  PaymentsProvider,
} from './payments-provider.interface.js';

/**
 * Stripe (test mode friendly) provider.
 * Uses Stripe Checkout Sessions + idempotency keys, so double-clicks and
 * retries never create duplicate sessions for the same payment.
 */
@Injectable()
export class StripeProvider implements PaymentsProvider {
  readonly name = 'STRIPE' as const;
  private client: Stripe | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<string>('STRIPE_SECRET_KEY'));
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const session = await this.getClient().checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: input.currency.toLowerCase(),
              product_data: { name: input.description },
              unit_amount: Math.round(input.amount * 100),
            },
            quantity: 1,
          },
        ],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        customer_email: input.customerEmail,
        metadata: { paymentId: input.paymentId },
      },
      { idempotencyKey: `checkout-${input.paymentId}` },
    );

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return {
      providerRef: session.id,
      checkoutUrl: session.url,
      provider: 'STRIPE',
    };
  }

  /**
   * Verifies the webhook signature against the EXACT raw request bytes.
   * Throws when the signature is invalid — never trust unverified webhooks.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }
    return this.getClient().webhooks.constructEvent(
      rawBody,
      signature,
      secret,
    );
  }

  private getClient(): Stripe {
    if (!this.client) {
      const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
      if (!secretKey) {
        throw new Error(
          'STRIPE_SECRET_KEY is not set. Set PAYMENTS_PROVIDER=fake for offline testing.',
        );
      }
      this.client = new Stripe(secretKey);
    }
    return this.client;
  }
}
