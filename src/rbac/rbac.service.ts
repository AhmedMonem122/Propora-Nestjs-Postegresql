import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

const CACHE_TTL_MS = 30_000;

interface CachedPermissions {
  permissions: Set<string>;
  expiresAt: number;
}

@Injectable()
export class RbacService {
  private readonly cache = new Map<string, CachedPermissions>();

  constructor(private readonly prisma: PrismaService) {}

  async getUserPermissions(userId: string): Promise<Set<string>> {
    const cached = this.cache.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const permissions = new Set<string>();

    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        permissions.add(rolePermission.permission.name);
      }
    }

    this.cache.set(userId, {
      permissions,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return permissions;
  }

  async getPermissionCatalog() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async validatePermissionNames(names: string[]): Promise<string[]> {
    const existing = await this.prisma.permission.findMany({
      where: { name: { in: names } },
    });

    const existingNames = new Set(existing.map((permission) => permission.name));
    const unknown = names.filter((name) => !existingNames.has(name));

    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown permission(s): ${unknown.join(', ')}. Use GET /roles/permissions to list the catalog.`,
      );
    }

    return names;
  }

  invalidateUserCache(userId: string): void {
    this.cache.delete(userId);
  }

  async invalidateRoleCache(roleId: string): Promise<void> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });

    for (const userRole of userRoles) {
      this.cache.delete(userRole.userId);
    }
  }
}
