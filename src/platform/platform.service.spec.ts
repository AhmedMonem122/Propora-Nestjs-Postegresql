import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PlatformService } from './platform.service.js';

function createService() {
  const tx = {
    userRole: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'user-1',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          phone: null,
          organizationId: 'org-1',
          status: 'ACTIVE',
          userRoles: [],
          ...data,
        }),
      ),
    },
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue({ id: 'user-1' }),
    },
    userRole: { count: vi.fn().mockResolvedValue(1) },
    role: { findMany: vi.fn().mockResolvedValue([]) },
    document: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    maintenanceRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  const events = { emit: vi.fn() };
  const audit = { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) };
  const rbac = { invalidateUserCache: vi.fn() };
  const service = new PlatformService(
    prisma as never,
    events as never,
    audit as never,
    rbac as never,
  );
  return { service, prisma, audit, rbac, tx };
}

describe('PlatformService.removeManagedUserPermanently', () => {
  it('refuses to delete your own account', async () => {
    const { service } = createService();
    await expect(
      service.removeManagedUserPermanently('user-1', 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to delete the last organization owner', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
      userRoles: [{ roleId: 'role-owner' }],
    });
    prisma.role.findMany.mockResolvedValue([{ id: 'role-owner' }]);
    prisma.userRole.count.mockResolvedValue(0);

    await expect(
      service.removeManagedUserPermanently('user-1', null),
    ).rejects.toThrow(/last owner/i);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('detaches authorship links, deletes the row and audits', async () => {
    const { service, prisma, audit } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
      userRoles: [{ roleId: 'role-staff' }],
    });
    prisma.role.findMany.mockResolvedValue([{ id: 'role-owner' }]);

    const result = await service.removeManagedUserPermanently('user-1', null);

    expect(result).toEqual({ id: 'user-1', deleted: true, permanent: true });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { uploadedById: 'user-1' },
      data: { uploadedById: null },
    });
    expect(prisma.maintenanceRequest.updateMany).toHaveBeenCalledWith({
      where: { assignedToId: 'user-1' },
      data: { assignedToId: null },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.userDeleted',
        entityId: 'user-1',
      }),
    );
  });
});

describe('PlatformService.updateManagedUser roles', () => {
  it('replaces roles inside the user organization and busts the cache', async () => {
    const { service, prisma, rbac, tx } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
    });
    prisma.role.findMany.mockResolvedValue([
      { id: 'role-owner' },
      { id: 'role-staff' },
    ]);

    const result = await service.updateManagedUser('user-1', {
      roleIds: ['role-owner', 'role-staff'],
    } as never);

    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', roleId: 'role-owner' },
        { userId: 'user-1', roleId: 'role-staff' },
      ],
      skipDuplicates: true,
    });
    expect(rbac.invalidateUserCache).toHaveBeenCalledWith('user-1');
    expect(result.id).toBe('user-1');
  });

  it('rejects roles from another organization', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
    });
    prisma.role.findMany.mockResolvedValue([{ id: 'role-owner' }]);

    await expect(
      service.updateManagedUser('user-1', {
        roleIds: ['role-owner', 'role-foreign'],
      } as never),
    ).rejects.toThrow(/not found in the user organization/i);
  });
});

describe('PlatformService.removeOrganization', () => {
  it('requires the slug confirmation to match', async () => {
    const { service, prisma } = createService();
    prisma.organization = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'org-1',
        slug: 'acme',
        _count: { users: 2 },
      }),
      delete: vi.fn(),
    };

    await expect(
      service.removeOrganization('org-1', 'wrong-slug'),
    ).rejects.toThrow(/confirmation does not match/i);
    expect(prisma.organization.delete).not.toHaveBeenCalled();
  });

  it('wipes the organization and returns the receipt counts', async () => {
    const { service, prisma } = createService();
    prisma.organization = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'org-1',
        slug: 'acme',
        _count: { users: 2, properties: 1, leases: 0, payments: 0, documents: 0 },
      }),
      delete: vi.fn().mockResolvedValue({ id: 'org-1' }),
    };

    const result = await service.removeOrganization('org-1', 'acme');

    expect(prisma.organization.delete).toHaveBeenCalledWith({
      where: { id: 'org-1' },
    });
    expect(result).toEqual({
      id: 'org-1',
      slug: 'acme',
      deleted: true,
      permanent: true,
      removed: { users: 2, properties: 1, leases: 0, payments: 0, documents: 0 },
    });
  });
});
