import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PlatformService } from './platform.service.js';

function createService() {
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
    $transaction: vi.fn((arg: unknown[]) => Promise.all(arg)),
  };
  const events = { emit: vi.fn() };
  const audit = { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) };
  const service = new PlatformService(
    prisma as never,
    events as never,
    audit as never,
  );
  return { service, prisma, audit };
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
