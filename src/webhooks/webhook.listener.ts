import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../common/events/event-bus.js';
import { WebhooksService } from './webhooks.service.js';

/**
 * Bridges domain events to tenant webhook endpoints.
 * Delivery is best-effort (logged per attempt); the bus isolates failures.
 */
@Injectable()
export class WebhookListener implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly webhooks: WebhooksService,
  ) {}

  onModuleInit() {
    this.events.on('payment.paid', (payload) =>
      this.webhooks.dispatch(payload.organizationId, 'payment.paid', {
        paymentId: payload.paymentId,
        leaseId: payload.leaseId,
        amount: payload.amount,
        currency: payload.currency,
      }),
    );
    this.events.on('maintenance.assigned', (payload) =>
      this.webhooks.dispatch(payload.organizationId, 'maintenance.assigned', {
        requestId: payload.requestId,
        assigneeId: payload.assigneeId,
        title: payload.title,
      }),
    );
    this.events.on('user.invited', (payload) =>
      this.webhooks.dispatch(payload.organizationId, 'user.invited', {
        email: payload.email,
      }),
    );
  }
}
