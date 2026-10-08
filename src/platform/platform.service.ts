import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import {
  CreatePlatformUserDto,
  UpdatePlatformUserDto,
} from './dto/platform-user.dto.js';

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
    return this.updateOrganization(organizationId, { status });
  }

  async updateOrganization(
    organizationId: string,
    dto: {
      status?: OrganizationStatus;
      plan?: string;
      subscriptionStatus?: SubscriptionStatus;
      platformManagerId?: string | null;
    },
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (dto.platformManagerId) {
      const manager = await this.prisma.platformUser.findUnique({
        where: { id: dto.platformManagerId },
      });
      if (!manager) {
        throw new BadRequestException('Platform user not found');
      }
    }

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
        ...(dto.subscriptionStatus
          ? { subscriptionStatus: dto.subscriptionStatus }
          : {}),
        ...(dto.platformManagerId !== undefined
          ? { platformManagerId: dto.platformManagerId }
          : {}),
      },
    });
  }

  async listPlatformUsers(query: { page?: number; limit?: number }) {
    const { page, limit, skip, take } = normalizePagination(query);

    const [total, users] = await this.prisma.$transaction([
      this.prisma.platformUser.count(),
      this.prisma.platformUser.findMany({
        include: {
          user: { select: { id: true, email: true } },
          _count: { select: { managedOrganizations: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(users, buildPaginationMeta(total, page, limit));
  }

  async createPlatformUser(
    callerPlatformAdminId: string | null,
    dto: CreatePlatformUserDto,
  ) {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.platformUser.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException(
        'A platform user with this email already exists',
      );
    }

    const platformAdminId =
      callerPlatformAdminId ?? (await this.defaultPlatformAdminId());
    await this.assertLinkableUser(dto.userId);

    return this.prisma.platformUser.create({
      data: {
        platformAdminId,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        userId: dto.userId,
      },
    });
  }

  async updatePlatformUser(id: string, dto: UpdatePlatformUserDto) {
    const existing = await this.prisma.platformUser.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Platform user not found');
    }

    if (dto.email && dto.email.toLowerCase() !== existing.email) {
      const clash = await this.prisma.platformUser.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (clash) {
        throw new ConflictException(
          'A platform user with this email already exists',
        );
      }
    }

    if (dto.userId !== undefined) {
      await this.assertLinkableUser(dto.userId, id);
    }

    return this.prisma.platformUser.update({
      where: { id },
      data: {
        ...(dto.email ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
      },
    });
  }

  async removePlatformUser(id: string) {
    const existing = await this.prisma.platformUser.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Platform user not found');
    }

    // Managed organizations are detached (SetNull), never deleted.
    await this.prisma.platformUser.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async defaultPlatformAdminId(): Promise<string> {
    const admin = await this.prisma.platformAdmin.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw new BadRequestException(
        'No platform admin account exists yet — run the database seed first',
      );
    }
    return admin.id;
  }

  private async assertLinkableUser(
    userId: string | null | undefined,
    excludePlatformUserId?: string,
  ): Promise<void> {
    if (!userId) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Linked user not found');
    }

    const taken = await this.prisma.platformUser.findFirst({
      where: {
        userId,
        ...(excludePlatformUserId
          ? { id: { not: excludePlatformUserId } }
          : {}),
      },
      select: { id: true },
    });
    if (taken) {
      throw new BadRequestException(
        'This user account is already linked to another platform user',
      );
    }
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
