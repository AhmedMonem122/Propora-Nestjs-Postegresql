import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
} from './dto/payment.dto.js';

export interface PaymentListQuery {
  leaseId?: string;
  status?: PaymentStatus;
  method?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll(query: PaymentListQuery) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.PaymentWhereInput = {
      organizationId,
      ...(query.leaseId ? { leaseId: query.leaseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method as Prisma.EnumPaymentMethodFilter } : {}),
      ...(query.overdue
        ? {
            status: 'PENDING',
            dueDate: { lt: new Date() },
          }
        : {}),
    };

    const [total, payments] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          lease: {
            include: {
              unit: { include: { building: { include: { property: true } } } },
              resident: true,
            },
          },
        },
        orderBy: { dueDate: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(payments, buildPaginationMeta(total, page, limit));
  }

  async createForLease(leaseId: string, dto: CreatePaymentDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, organizationId },
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    return this.prisma.payment.create({
      data: {
        ...dto,
        organizationId,
        leaseId,
        currency: dto.currency ?? 'USD',
        method: dto.method ?? 'BANK_TRANSFER',
        status: dto.status ?? 'PENDING',
        paidAt: dto.paidAt ?? null,
      },
      include: { lease: { include: { unit: true, resident: true } } },
    });
  }

  async findOne(paymentId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: {
        lease: {
          include: {
            unit: { include: { building: { include: { property: true } } } },
            resident: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async update(paymentId: string, dto: UpdatePaymentDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const nextStatus = dto.status ?? payment.status;
    const paidAt =
      dto.paidAt !== undefined
        ? dto.paidAt
        : nextStatus === 'PAID' && payment.status !== 'PAID'
          ? new Date()
          : payment.paidAt;

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        amount: dto.amount,
        currency: dto.currency,
        method: dto.method,
        status: dto.status,
        dueDate: dto.dueDate,
        paidAt,
        invoiceNo: dto.invoiceNo,
        notes: dto.notes,
      },
      include: { lease: { include: { unit: true, resident: true } } },
    });
  }

  async remove(paymentId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.prisma.payment.delete({ where: { id: paymentId } });

    return { id: paymentId, deleted: true };
  }
}
