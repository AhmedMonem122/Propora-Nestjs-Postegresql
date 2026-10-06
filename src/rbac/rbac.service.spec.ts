import { describe, expect, it, vi } from 'vitest';
import { RbacService } from '../../src/rbac/rbac.service.js';

const makePrisma = (userRoles: unknown[], permissions: unknown[] = []) => ({
  userRole: {
    findMany: vi.fn().mockResolvedValue(userRoles),
  },
  permission: {
    findMany: vi.fn().mockResolvedValue(permissions),
  },
});

describe('RbacService', () => {
  it('flattens permissions from all user roles', async () => {
    const prisma = makePrisma([
      {
        role: {
          rolePermissions: [
            { permission: { name: 'property:read' } },
            { permission: { name: 'property:create' } },
          ],
        },
      },
      {
        role: {
          rolePermissions: [{ permission: { name: 'payment:read' } }],
        },
      },
    ]);

    const service = new RbacService(prisma as never);
    const permissions = await service.getUserPermissions('user-1');

    expect(permissions.has('property:read')).toBe(true);
    expect(permissions.has('property:create')).toBe(true);
    expect(permissions.has('payment:read')).toBe(true);
    expect(permissions.has('property:delete')).toBe(false);
  });

  it('caches resolved permissions within the ttl', async () => {
    const prisma = makePrisma([
      {
        role: {
          rolePermissions: [{ permission: { name: 'unit:read' } }],
        },
      },
    ]);

    const service = new RbacService(prisma as never);

    await service.getUserPermissions('user-1');
    await service.getUserPermissions('user-1');

    expect(prisma.userRole.findMany).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache for a user', async () => {
    const prisma = makePrisma([
      {
        role: {
          rolePermissions: [{ permission: { name: 'unit:read' } }],
        },
      },
    ]);

    const service = new RbacService(prisma as never);

    await service.getUserPermissions('user-1');
    service.invalidateUserCache('user-1');
    await service.getUserPermissions('user-1');

    expect(prisma.userRole.findMany).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown permission names', async () => {
    const prisma = makePrisma(
      [],
      [{ name: 'property:read' }],
    );

    const service = new RbacService(prisma as never);

    await expect(
      service.validatePermissionNames([
        'property:read',
        'not:a-permission',
      ]),
    ).rejects.toThrow(/Unknown permission/);
  });

  it('accepts known permission names', async () => {
    const prisma = makePrisma([], [{ name: 'property:read' }]);

    const service = new RbacService(prisma as never);
    const names = await service.validatePermissionNames(['property:read']);

    expect(names).toEqual(['property:read']);
  });
});
