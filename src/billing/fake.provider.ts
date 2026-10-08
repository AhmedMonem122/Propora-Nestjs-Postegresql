import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type {
  CheckoutInput,
  CheckoutSession,
  PaymentsProvider,
} from './payments-provider.interface.js';

/**
 * Offline/test provider: no keys, no network. The checkout URL points back
 * at a confirm link that runs the exact same `markPaid` pipeline as the
 * Stripe webhook, so every downstream side effect (invoice, email,
 * notification, webhooks) is exercised end-to-end from Swagger.
 *
 * The session reference embeds the payment id (`fake_<paymentId>_<rand>`)
 * so confirmation is stateless and works on serverless too.
 */
@Injectable()
export class FakeProvider implements PaymentsProvider {
  readonly name = 'FAKE' as const;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return true;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const providerRef = `fake_${input.paymentId}_${randomBytes(8).toString('hex')}`;
    const baseUrl = this.configService
      .get<string>('APP_PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/$/, '');

    return {
      providerRef,
      checkoutUrl: `${baseUrl}/api/v1/billing/fake/${providerRef}/confirm`,
      provider: 'FAKE',
    };
  }
}
