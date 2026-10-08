import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AuditModule } from '../audit/audit.module.js';
import {
  PAYMENTS_PROVIDER,
  type PaymentsProvider,
} from './payments-provider.interface.js';
import { StripeProvider } from './stripe.provider.js';
import { FakeProvider } from './fake.provider.js';
import { BillingService } from './billing.service.js';
import { InvoicesService } from './invoices.service.js';
import { CheckoutController } from './checkout.controller.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';

/**
 * Factory (Strategy selector): Stripe when keys are present, Fake otherwise,
 * explicit override via PAYMENTS_PROVIDER=stripe|fake.
 */
function selectProvider(
  config: ConfigService,
  stripe: StripeProvider,
  fake: FakeProvider,
): PaymentsProvider {
  const forced = config
    .get<string>('PAYMENTS_PROVIDER', 'auto')
    .toLowerCase();
  if (forced === 'stripe') {
    return stripe;
  }
  if (forced === 'fake') {
    return fake;
  }
  return stripe.isConfigured() ? stripe : fake;
}

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [CheckoutController, StripeWebhookController],
  providers: [
    StripeProvider,
    FakeProvider,
    {
      provide: PAYMENTS_PROVIDER,
      useFactory: selectProvider,
      inject: [ConfigService, StripeProvider, FakeProvider],
    },
    BillingService,
    InvoicesService,
  ],
  exports: [BillingService, InvoicesService],
})
export class BillingModule {}
