import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationStatus,
  Prisma,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import { EventBus } from '../common/events/event-bus.js';
import { AuditService } from '../audit/audit.service.js';
import { toUserResponse } from '../common/dto/user-response.dto.js';
import {
  CreatePlatformUserDto,
  UpdatePlatformUserDto,
} from './dto/platform-user.dto.js';
import {
  AdminUserQueryDto,
  CreateManagedUserDto,
  UpdateManagedUserDto,
} from './dto/platform-manage-user.dto.js';

export interface PlatformOrganizationQuery {
  status?: OrganizationStatus;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly audit: AuditService,
  ) {}

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

  // ------------------------------------------------------------------
  // Cross-organization member management (the admin-dashboard user API).
  // Organization owners keep managing their own members via /users — these
  // routes let platform admins reach every account on the platform.
  // ------------------------------------------------------------------

  async listAllUsers(query: AdminUserQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.UserWhereInput = {
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          userRoles: { include: { role: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(users, buildPaginationMeta(total, page, limit));
  }

  async createManagedUser(dto: CreateManagedUserDto) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });
    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const roleIds = [...new Set(dto.roleIds ?? [])];
    if (roleIds.length > 0) {
      const roles = await this.prisma.role.findMany({
        where: { id: { in: roleIds }, organizationId: dto.organizationId },
      });
      if (roles.length !== roleIds.length) {
        throw new BadRequestException(
          'One or more roles were not found in the organization',
        );
      }
    }

    const user = await this.prisma.user.create({
      data: {
        organizationId: dto.organizationId,
        email,
        passwordHash: await bcryptjs.hash(dto.password, 12),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        status: 'ACTIVE',
        userRoles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
      include: { userRoles: { include: { role: true } } },
    });

    await this.events.emit('user.invited', {
      organizationId: dto.organizationId,
      organizationName: organization.name,
      email,
      firstName: dto.firstName,
      temporaryPassword: dto.password,
    });

    return toUserResponse(user);
  }

  async getManagedUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        userRoles: { include: { role: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { ...toUserResponse(user), organization: user.organization };
  }

  async updateManagedUser(id: string, dto: UpdateManagedUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.status
          ? {
              status: dto.status,
              // Admin reactivation is a fresh start.
              ...(dto.status === 'ACTIVE' ? { deletedAt: null } : {}),
            }
          : {}),
      },
      include: { userRoles: { include: { role: true } } },
    });

    return toUserResponse(updated);
  }

  async removeManagedUser(id: string, callerUserId: string | null) {
    if (callerUserId && callerUserId === id) {
      throw new ForbiddenException('You cannot delete your own account here');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Admin-side delete is a hard block, never a row delete: history, audit
    // trail and foreign keys stay intact. Self-service deleteMe() is the only
    // path that allows later reactivation.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { status: 'INACTIVE', tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { id, status: 'INACTIVE' as UserStatus };
  }

  /**
   * PERMANENT admin delete: removes the row and everything owned by it.
   * Guardrails: never yourself, never the last organization owner.
   * Organization data (documents, leases, payments) stays — only the
   * authorship links (uploadedBy, assignee) are detached first.
   */
  async removeManagedUserPermanently(
    id: string,
    callerUserId: string | null,
  ) {
    if (callerUserId && callerUserId === id) {
      throw new ForbiddenException('You cannot delete your own account here');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { select: { roleId: true } } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.organizationId) {
      const ownerRoleIds = (
        await this.prisma.role.findMany({
          where: {
            organizationId: user.organizationId,
            name: 'ORGANIZATION_OWNER',
          },
          select: { id: true },
        })
      ).map((role) => role.id);

      const isOwner = user.userRoles.some((userRole) =>
        ownerRoleIds.includes(userRole.roleId),
      );
      if (isOwner && ownerRoleIds.length > 0) {
        const otherOwners = await this.prisma.userRole.count({
          where: { roleId: { in: ownerRoleIds }, userId: { not: id } },
        });
        if (otherOwners === 0) {
          throw new ConflictException(
            'Cannot permanently delete the last owner of an organization — assign another owner first',
          );
        }
      }
    }

    const organizationId = user.organizationId;
    await this.prisma.$transaction([
      this.prisma.document.updateMany({
        where: { uploadedById: id },
        data: { uploadedById: null },
      }),
      this.prisma.maintenanceRequest.updateMany({
        where: { assignedToId: id },
        data: { assignedToId: null },
      }),
      // Cascades: roles, refresh + reset tokens, notifications.
      // SetNull: resident profile, linked platform user.
      this.prisma.user.delete({ where: { id } }),
    ]);

    if (organizationId) {
      await this.audit.log({
        organizationId,
        action: 'platform.userDeleted',
        entityType: 'user',
        entityId: id,
      });
    }

    return { id, deleted: true, permanent: true };
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
