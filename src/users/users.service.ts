import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import { RbacService } from '../rbac/rbac.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import { toUserResponse } from '../common/dto/user-response.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AssignRolesDto } from './dto/assign-roles.dto.js';

export interface UserListQuery {
  search?: string;
  status?: UserStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly rbacService: RbacService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(query: UserListQuery) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.UserWhereInput = {
      organizationId,
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
        include: { userRoles: { include: { role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(
      users.map((user) => toUserResponse(user)),
      buildPaginationMeta(total, page, limit),
    );
  }

  async create(dto: CreateUserDto) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException(
        'A user with this email already exists',
      );
    }

    const roleIds = [...new Set(dto.roleIds ?? [])];

    if (roleIds.length > 0) {
      const roles = await this.prisma.role.findMany({
        where: { id: { in: roleIds }, organizationId },
      });

      if (roles.length !== roleIds.length) {
        throw new BadRequestException(
          'One or more roles were not found in your organization',
        );
      }
    }

    const passwordHash = await bcryptjs.hash(
      dto.password,
      this.saltRounds(),
    );

    const user = await this.prisma.user.create({
      data: {
        organizationId,
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        status: 'ACTIVE',
        userRoles: {
          create: roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: { userRoles: { include: { role: true } } },
    });

    return toUserResponse(user);
  }

  async findOne(userId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toUserResponse(user);
  }

  async update(userId: string, dto: UpdateUserDto, currentUserId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (
      dto.status &&
      dto.status !== 'ACTIVE' &&
      userId === currentUserId
    ) {
      throw new BadRequestException(
        'You cannot deactivate your own account',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        status: dto.status,
      },
      include: { userRoles: { include: { role: true } } },
    });

    return toUserResponse(updated);
  }

  async remove(userId: string, currentUserId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (userId === currentUserId) {
      throw new BadRequestException(
        'You cannot delete your own account',
      );
    }

    await this.prisma.user.delete({ where: { id: userId } });

    return { id: userId, deleted: true };
  }

  async assignRoles(
    userId: string,
    dto: AssignRolesDto,
    currentUserId: string,
  ) {
    const organizationId = this.tenantContext.requireOrganizationId();

    if (userId === currentUserId) {
      throw new BadRequestException(
        'You cannot change your own roles. Ask another organization owner to do it.',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roleIds = [...new Set(dto.roleIds)];

    if (roleIds.length > 0) {
      const roles = await this.prisma.role.findMany({
        where: { id: { in: roleIds }, organizationId },
      });

      if (roles.length !== roleIds.length) {
        throw new BadRequestException(
          'One or more roles were not found in your organization',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      ...roleIds.map((roleId) =>
        this.prisma.userRole.create({ data: { userId, roleId } }),
      ),
    ]);

    this.rbacService.invalidateUserCache(userId);

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });

    return toUserResponse(updated!);
  }

  private saltRounds(): number {
    return Number(this.configService.get<number>('BCRYPT_SALT_ROUNDS', 12));
  }
}
