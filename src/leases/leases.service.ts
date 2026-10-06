import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, LeaseStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import { CreateLeaseDto, LeaseStatusDto, UpdateLeaseDto } from './dto/lease.dto.js';

export interface LeaseListQuery {
  unitId?: string;
  residentId?: string;
  status?: LeaseStatus;
  page?: number;
  limit?: number;
}

const OPEN_DATE = new Date('9999-12-31T23:59:59.999Z');

@Injectable()
export class LeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll(query: LeaseListQuery) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.LeaseWhereInput = {
      organizationId,
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.residentId ? { residentId: query.residentId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, leases] = await this.prisma.$transaction([
      this.prisma.lease.count({ where }),
      this.prisma.lease.findMany({
        where,
        include: {
          unit: { include: { building: { include: { property: true } } } },
          resident: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(leases, buildPaginationMeta(total, page, limit));
  }

  async create(dto: CreateLeaseDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    this.assertValidDates(dto.startDate, dto.endDate ?? null);

    const [unit, resident] = await Promise.all([
      this.prisma.unit.findFirst({ where: { id: dto.unitId, organizationId } }),
      this.prisma.resident.findFirst({
        where: { id: dto.residentId, organizationId },
      }),
    ]);

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    if (!resident) {
      throw new NotFoundException('Resident not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertNoOverlappingLease(tx, {
        organizationId,
        unitId: dto.unitId,
        startDate: dto.startDate,
        endDate: dto.endDate ?? null,
      });

      return tx.lease.create({
        data: {
          ...dto,
          endDate: dto.endDate ?? null,
          organizationId,
          depositAmount: dto.depositAmount ?? 0,
          paymentFrequency: dto.paymentFrequency ?? 'MONTHLY',
          status: dto.status ?? 'UPCOMING',
        },
        include: { unit: true, resident: true },
      });
    });
  }

  async findOne(leaseId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, organizationId },
      include: {
        unit: { include: { building: { include: { property: true } } } },
        resident: true,
        payments: { orderBy: { dueDate: 'desc' } },
      },
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    return lease;
  }

  async update(leaseId: string, dto: UpdateLeaseDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, organizationId },
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    const startDate = dto.startDate ?? lease.startDate;
    const endDate = dto.endDate !== undefined ? dto.endDate : lease.endDate;

    this.assertValidDates(startDate, endDate);

    if (dto.unitId && dto.unitId !== lease.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: dto.unitId, organizationId },
      });

      if (!unit) {
        throw new NotFoundException('Unit not found');
      }
    }

    if (dto.residentId && dto.residentId !== lease.residentId) {
      const resident = await this.prisma.resident.findFirst({
        where: { id: dto.residentId, organizationId },
      });

      if (!resident) {
        throw new NotFoundException('Resident not found');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertNoOverlappingLease(tx, {
        organizationId,
        unitId: dto.unitId ?? lease.unitId,
        startDate,
        endDate,
        excludeLeaseId: leaseId,
      });

      return tx.lease.update({
        where: { id: leaseId },
        data: {
          unitId: dto.unitId,
          residentId: dto.residentId,
          startDate,
          endDate,
          rentAmount: dto.rentAmount,
          depositAmount: dto.depositAmount,
          paymentFrequency: dto.paymentFrequency,
          status: dto.status,
          notes: dto.notes,
        },
        include: { unit: true, resident: true },
      });
    });
  }

  async updateStatus(leaseId: string, dto: LeaseStatusDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, organizationId },
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    return this.prisma.lease.update({
      where: { id: leaseId },
      data: { status: dto.status },
      include: { unit: true, resident: true },
    });
  }

  async remove(leaseId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, organizationId },
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    await this.prisma.lease.delete({ where: { id: leaseId } });

    return { id: leaseId, deleted: true };
  }

  private assertValidDates(startDate: Date, endDate: Date | null): void {
    if (endDate && endDate <= startDate) {
      throw new BadRequestException(
        'Lease end date must be after the start date',
      );
    }
  }

  private async assertNoOverlappingLease(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      unitId: string;
      startDate: Date;
      endDate: Date | null;
      excludeLeaseId?: string;
    },
  ): Promise<void> {
    const endBoundary = params.endDate ?? OPEN_DATE;

    const overlapping = await tx.lease.findFirst({
      where: {
        organizationId: params.organizationId,
        unitId: params.unitId,
        ...(params.excludeLeaseId
          ? { id: { not: params.excludeLeaseId } }
          : {}),
        status: { in: ['ACTIVE', 'UPCOMING'] },
        OR: [
          {
            AND: [
              { endDate: { gte: params.startDate } },
              { startDate: { lte: endBoundary } },
            ],
          },
          {
            AND: [
              { endDate: null },
              { startDate: { lte: endBoundary } },
            ],
          },
        ],
      },
    });

    if (overlapping) {
      throw new ConflictException(
        `This unit already has an overlapping ${overlapping.status.toLowerCase()} lease from ${overlapping.startDate.toISOString().slice(0, 10)}`,
      );
    }
  }
}
