import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../../src/notifications/notifications.service.js';

function createPrismaMock(notification: any) {
  return {
    notification: {
      findFirst: vi.fn().mockResolvedValue(notification),
      update: vi.fn().mockResolvedValue({ ...notification, readAt: new Date().toISOString() }),
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([notification]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn().mockImplementation(async (callbacks: any[]) => {
      const results = [];
      for (const cb of callbacks) {
        results.push(await cb({ notification: createPrismaMock(notification).notification }));
      }
      return results;
    }),
  } as any;
}

function createTenantContextMock(orgId: string, userId: string) {
  return {
    requireOrganizationId: vi.fn().mockReturnValue(orgId),
    getUserId: vi.fn().mockReturnValue(userId),
  } as any;
}

function createRealtimeMock() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('NotificationsService', () => {
  describe('markRead', () => {
    it('marks an existing notification as read', async () => {
      const notification = {
        id: 'notif-1',
        organizationId: 'org-1',
        userId: 'user-1',
        title: 'Test notification',
        body: 'Hello',
        readAt: null,
        createdAt: new Date().toISOString(),
      };

      const prisma = createPrismaMock(notification);
      const tenantContext = createTenantContextMock('org-1', 'user-1');
      const realtime = createRealtimeMock();

      const service = new NotificationsService(prisma, tenantContext, realtime);
      const result = await service.markRead('notif-1');

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'notif-1', organizationId: 'org-1', userId: 'user-1' },
      });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { readAt: expect.any(Date) },
      });
      expect(result.readAt).toBeDefined();
    });

    it('throws NotFoundException when notification does not exist', async () => {
      const prisma = createPrismaMock(null);
      const tenantContext = createTenantContextMock('org-1', 'user-1');
      const realtime = createRealtimeMock();

      const service = new NotificationsService(prisma, tenantContext, realtime);
      await expect(service.markRead('notif-missing')).rejects.toThrow('Notification not found');
    });

    it('scopes markRead to the correct organization and user', async () => {
      const notification = {
        id: 'notif-2',
        organizationId: 'org-2',
        userId: 'user-2',
        title: 'Other org notification',
        body: 'Hello',
        readAt: null,
        createdAt: new Date().toISOString(),
      };

      const prisma = createPrismaMock(notification);
      const tenantContext = createTenantContextMock('org-2', 'user-2');
      const realtime = createRealtimeMock();

      const service = new NotificationsService(prisma, tenantContext, realtime);
      await service.markRead('notif-2');

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'notif-2', organizationId: 'org-2', userId: 'user-2' },
      });
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications as read', async () => {
      const prisma = createPrismaMock(null);
      const tenantContext = createTenantContextMock('org-1', 'user-1');
      const realtime = createRealtimeMock();

      const service = new NotificationsService(prisma, tenantContext, realtime);
      const result = await service.markAllRead();

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({ markedRead: 1 });
    });
  });
});
