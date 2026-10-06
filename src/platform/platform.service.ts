import { Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';

export interface PlatformOrganizationQuery {
  status?: OrganizationStatus;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrganizations(query: PlatformOrganizationQuery) {
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.OrganizationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, organizations] = await this.prisma.$transaction([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        include: {
          _count: { select: { users: true, properties: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(
      organizations,
      buildPaginationMeta(total, page, limit),
    );
  }

  async getOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            users: true,
            properties: true,
            roles: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async updateOrganizationStatus(
    organizationId: string,
    status: OrganizationStatus,
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { status },
    });
  }

  async getStats() {
    const [
      organizations,
      users,
      properties,
      buildings,
      units,
      activeLeases,
      paidPayments,
      openMaintenanceRequests,
    ] = await this.prisma.$transaction([
      this.prisma.organization.count(),
      this.prisma.user.count(),
      this.prisma.property.count(),
      this.prisma.building.count(),
      this.prisma.unit.count(),
      this.prisma.lease.count({ where: { status: 'ACTIVE' } }),
      this.prisma.payment.count({ where: { status: 'PAID' } }),
      this.prisma.maintenanceRequest.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
    ]);

    return {
      organizations,
      users,
      properties,
      buildings,
      units,
      activeLeases,
      paidPayments,
      openMaintenanceRequests,
    };
  }
}
