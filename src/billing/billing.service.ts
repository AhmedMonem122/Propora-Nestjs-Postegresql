import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import { EventBus } from '../common/events/event-bus.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  PAYMENTS_PROVIDER,
  type PaymentsProvider,
} from './payments-provider.interface.js';
import { StripeProvider } from './stripe.provider.js';
import { InvoicesService } from './invoices.service.js';

/**
 * Single choke point for "money arrived": Stripe webhooks, the fake
 * provider confirm link and manual overrides all funnel through `markPaid`,
 * which is idempotent — provider retries replay safely.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly config: ConfigService,
    @Inject(PAYMENTS_PROVIDER) private readonly provider: PaymentsProvider,
    private readonly stripe: StripeProvider,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
    private readonly events: EventBus,
    private readonly audit: AuditService,
  ) {}

  activeProviderName(): string {
    return this.provider.name;
  }

  async createCheckout(paymentId: string) {
    const organizationId = this.tenant.requireOrganizationId();

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: {
        lease: {
          include: {
            resident: true,
            unit: { include: { building: { include: { property: true } } } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.status === 'PAID') {
      throw new ConflictException('Payment is already paid');
    }

    const frontend = this.config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/$/, '');

    const session = await this.provider.createCheckout({
      paymentId: payment.id,
      amount: Number(payment.amount.toString()),
      currency: payment.currency,
      description: `Rent — ${payment.lease.unit.building.property.name} / ${payment.lease.unit.name}`,
      successUrl: `${frontend}/billing/success?paymentId=${payment.id}`,
      cancelUrl: `${frontend}/billing/cancel?paymentId=${payment.id}`,
      customerEmail: payment.lease.resident.email ?? undefined,
    });

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        provider: session.provider,
        providerRef: session.providerRef,
        checkoutUrl: session.checkoutUrl,
      },
    });

    await this.audit.log({
      organizationId,
      userId: this.tenant.getUserId(),
      action: 'payment.checkout',
      entityType: 'payment',
      entityId: payment.id,
    });

    return {
      paymentId: updated.id,
      provider: updated.provider,
      checkoutUrl: updated.checkoutUrl,
    };
  }

  async confirmFakeSession(providerRef: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef },
    });

    if (!payment || payment.provider !== 'FAKE') {
      throw new NotFoundException('Checkout session not found');
    }

    return this.markPaid(payment.id, {
      provider: 'FAKE',
      transactionId: providerRef,
    });
  }

  async handleStripeWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ received: boolean; ignored?: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        id: string;
        metadata?: { paymentId?: string };
        payment_intent?: string;
      };
      const paymentId = session.metadata?.paymentId;
      if (!paymentId) {
        this.logger.warn(
          `Stripe session ${session.id} carries no paymentId metadata — ignored`,
        );
        return { received: true, ignored: true };
      }

      await this.markPaid(paymentId, {
        provider: 'STRIPE',
        transactionId: session.payment_intent ?? session.id,
      });
    }

    return { received: true };
  }

  async markPaid(
    paymentId: string,
    input: { provider: string; transactionId?: string },
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.status === 'PAID') {
      return payment;
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        provider: input.provider,
        transactionId: input.transactionId ?? payment.transactionId,
      },
    });

    return this.completePaidSideEffects(paymentId);
  }

  /**
   * Invoice + notification + domain event for an already-PAID payment.
   * Shared by the webhook/fake/manual paths so all of them behave alike.
   */
  async completePaidSideEffects(paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId },
      include: {
        lease: {
          include: {
            resident: true,
            unit: { include: { building: { include: { property: true } } } },
          },
        },
        organization: { select: { name: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const invoice = await this.invoices
      .generateForPayment(payment.id)
      .catch((error) => {
        this.logger.error(
          `Invoice generation failed for ${payment.id}: ${(error as Error)?.message}`,
        );
        return null;
      });

    await this.notifications.createForUser({
      // Resident portal accounts get it directly; otherwise org owners do.
      userId:
        payment.lease.resident.userId ??
        (await this.ownerId(payment.organizationId)),
      organizationId: payment.organizationId,
      title: 'Payment received',
      body: `${Number(payment.amount.toString()).toFixed(2)} ${payment.currency} received for ${payment.lease.unit.building.property.name} / ${payment.lease.unit.name}${invoice?.invoiceNo ? ` (${invoice.invoiceNo})` : ''}.`,
      type: 'INFO',
    });

    await this.audit.log({
      organizationId: payment.organizationId,
      action: 'payment.paid',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        amount: Number(payment.amount.toString()),
        currency: payment.currency,
        provider: payment.provider,
        invoiceNo: invoice?.invoiceNo ?? payment.invoiceNo,
      },
    });

    await this.events.emit('payment.paid', {
      organizationId: payment.organizationId,
      paymentId: payment.id,
      leaseId: payment.leaseId,
      amount: Number(payment.amount.toString()),
      currency: payment.currency,
    });

    return { ...payment, invoiceNo: invoice?.invoiceNo ?? payment.invoiceNo };
  }

  private async ownerId(organizationId: string): Promise<string> {
    // Fallback recipient when the resident has no portal account.
    const owner = await this.prisma.user.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
        userRoles: { some: { role: { name: 'ORGANIZATION_OWNER' } } },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!owner) {
      throw new NotFoundException(
        'No organization owner available for the receipt notification',
      );
    }
    return owner.id;
  }
}
