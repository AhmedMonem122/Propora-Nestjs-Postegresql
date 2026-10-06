import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import { RbacService } from './rbac.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(dto: CreateRoleDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const permissionNames = await this.rbacService.validatePermissionNames(
      dto.permissions,
    );

    const nameConflict = await this.prisma.role.findFirst({
      where: { organizationId, name: dto.name },
    });

    if (nameConflict) {
      throw new ConflictException(`Role "${dto.name}" already exists`);
    }

    return this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        isSystem: false,
        organizationId,
        rolePermissions: {
          create: permissionNames.map((name) => ({
            permission: { connect: { name } },
          })),
        },
      },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  async findAll() {
    const organizationId = this.tenantContext.requireOrganizationId();

    return this.prisma.role.findMany({
      where: { organizationId },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(roleId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async update(roleId: string, dto: UpdateRoleDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be modified');
    }

    if (dto.name && dto.name !== role.name) {
      const nameConflict = await this.prisma.role.findFirst({
        where: { organizationId, name: dto.name },
      });

      if (nameConflict) {
        throw new ConflictException(`Role "${dto.name}" already exists`);
      }
    }

    const permissionNames = dto.permissions
      ? await this.rbacService.validatePermissionNames(dto.permissions)
      : null;

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name,
        description: dto.description,
        rolePermissions: permissionNames
          ? {
              deleteMany: {},
              create: permissionNames.map((name) => ({
                permission: { connect: { name } },
              })),
            }
          : undefined,
      },
      include: { rolePermissions: { include: { permission: true } } },
    });

    await this.rbacService.invalidateRoleCache(roleId);

    return updated;
  }

  async remove(roleId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
      include: { _count: { select: { userRoles: true } } },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    const assignedUsers = role._count?.userRoles ?? 0;

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { roleId } }),
      this.prisma.role.delete({ where: { id: roleId } }),
    ]);

    return { id: roleId, deleted: true, unassignedUsers: assignedUsers };
  }
}
