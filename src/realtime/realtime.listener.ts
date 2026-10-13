import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../common/events/event-bus.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Bridges domain events to live clients. The database notification row
 * (notification.created) is broadcast by NotificationsService itself;
 * operational events need an explicit bridge or the frontend's realtime
 * contract (payment.paid / maintenance.assigned) would never fire.
 */
@Injectable()
export class RealtimeListener implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit() {
    this.events.on('payment.paid', (payload) =>
      this.realtime.publish(payload.organizationId, 'payment.paid', {
        paymentId: payload.paymentId,
        leaseId: payload.leaseId,
        amount: payload.amount,
        currency: payload.currency,
      }),
    );
    this.events.on('maintenance.assigned', (payload) =>
      this.realtime.publish(payload.organizationId, 'maintenance.assigned', {
        requestId: payload.requestId,
        assigneeId: payload.assigneeId,
        title: payload.title,
      }),
    );
  }
}
