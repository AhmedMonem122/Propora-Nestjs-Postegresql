import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import { EventBus } from '../common/events/event-bus.js';
import type {
  MaintenanceAssignedEvent,
  PaymentPaidEvent,
  UserInvitedEvent,
  UserRegisteredEvent,
} from '../common/events/domain-events.js';
import { MailService } from './mail.service.js';

/**
 * Reacts to domain events with transactional email.
 * Delivery failures are isolated by the EventBus and logged here —
 * email can never break the request that triggered it.
 */
@Injectable()
export class MailListener implements OnModuleInit {
  private readonly logger = new Logger(MailListener.name);

  constructor(
    private readonly events: EventBus,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.events.on('user.registered', (payload) => this.sendWelcome(payload));
    this.events.on('user.invited', (payload) => this.sendInvite(payload));
    this.events.on('user.passwordResetRequested', (payload) =>
      this.sendOtp(payload),
    );
    this.events.on('user.passwordChanged', (payload) =>
      this.mail.send({
        to: payload.email,
        subject: 'Security alert: your Propora password was changed',
        template: 'password-changed',
        context: { email: payload.email },
      }),
    );
    this.events.on('maintenance.assigned', (payload) =>
      this.sendAssignment(payload),
    );
    this.events.on('payment.paid', (payload) => this.sendReceipt(payload));
  }

  private sendWelcome(payload: UserRegisteredEvent) {
    return this.mail.send({
      to: payload.email,
      subject: `Welcome to ${payload.organizationName} on Propora`,
      template: 'welcome',
      context: {
        firstName: payload.firstName,
        email: payload.email,
        organizationName: payload.organizationName,
      },
    });
  }

  private sendInvite(payload: UserInvitedEvent) {
    return this.mail.send({
      to: payload.email,
      subject: `You are invited to ${payload.organizationName} on Propora`,
      template: 'invite',
      context: {
        firstName: payload.firstName,
        email: payload.email,
        organizationName: payload.organizationName,
        temporaryPassword: payload.temporaryPassword ?? null,
      },
    });
  }

  private async sendOtp(payload: {
    email: string;
    firstName: string;
    otp: string;
    ttlMinutes: number;
  }) {
    const result = await this.mail.send({
      to: payload.email,
      subject: 'Your Propora password reset code',
      template: 'otp',
      context: {
        firstName: payload.firstName,
        otp: payload.otp,
        ttlMinutes: payload.ttlMinutes,
      },
    });

    // Without a mail provider there is no other way to see the code in
    // development — log it, but NEVER in production.
    if (
      result.skipped &&
      this.config.get<string>('NODE_ENV', 'development') !== 'production'
    ) {
      this.logger.warn(
        `[dev-only] password reset OTP for ${payload.email}: ${payload.otp}`,
      );
    }
  }

  private async sendAssignment(payload: MaintenanceAssignedEvent) {
    const request = await this.prisma.maintenanceRequest.findUnique({
      where: { id: payload.requestId },
      include: {
        unit: { include: { building: { include: { property: true } } } },
        assignee: true,
      },
    });
    if (!request) {
      return;
    }

    const to = payload.assigneeEmail ?? request.assignee?.email;
    if (!to) {
      this.logger.warn(
        `Assignment mail skipped: assignee has no email (${payload.requestId})`,
      );
      return;
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: payload.organizationId },
      select: { name: true },
    });

    return this.mail.send({
      to,
      subject: `Assigned: ${request.title}`,
      template: 'maintenance-assigned',
      context: {
        organizationName: organization?.name ?? 'Propora',
        title: request.title,
        description: request.description ?? null,
        unitLabel: `${request.unit.building.property.name} / ${request.unit.name}`,
        priority: request.priority,
        scheduledAt: request.scheduledAt
          ? request.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')
          : null,
      },
    });
  }

  private async sendReceipt(payload: PaymentPaidEvent) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: payload.paymentId },
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
      return;
    }

    const recipients = new Set<string>();
    if (payment.lease.resident.email) {
      recipients.add(payment.lease.resident.email);
    }
    if (recipients.size === 0) {
      const owners = await this.prisma.user.findMany({
        where: {
          organizationId: payload.organizationId,
          status: 'ACTIVE',
          userRoles: { some: { role: { name: 'ORGANIZATION_OWNER' } } },
        },
        select: { email: true },
      });
      for (const owner of owners) {
        recipients.add(owner.email);
      }
    }
    if (recipients.size === 0) {
      this.logger.warn(
        `Receipt mail skipped: no recipient for payment ${payload.paymentId}`,
      );
      return;
    }

    const amount =
      typeof payment.amount === 'object' && payment.amount !== null
        ? Number(payment.amount.toString())
        : Number(payment.amount);

    for (const to of recipients) {
      await this.mail.send({
        to,
        subject: `Payment receipt ${payment.invoiceNo ?? payment.id}`,
        template: 'receipt',
        context: {
          organizationName: payment.organization.name,
          invoiceNo: payment.invoiceNo ?? payment.id,
          residentName:
            `${payment.lease.resident.firstName} ${payment.lease.resident.lastName}`.trim() ||
            null,
          amount: amount.toFixed(2),
          currency: payment.currency,
          propertyLabel: `${payment.lease.unit.building.property.name} / ${payment.lease.unit.name}`,
          paidAt: (payment.paidAt ?? payment.updatedAt)
            .toISOString()
            .slice(0, 10),
          transactionId: payment.transactionId ?? null,
        },
      });
    }
  }
}
