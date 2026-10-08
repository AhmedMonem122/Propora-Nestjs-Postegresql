import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';

export interface NotificationListQuery {
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateNotificationInput {
  userId: string;
  organizationId: string;
  title: string;
  body: string;
  type?: NotificationType;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly realtime: RealtimeService,
  ) {}

  async findMine(query: NotificationListQuery) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const userId = this.tenantContext.getUserId();
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.NotificationWhereInput = {
      organizationId,
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [total, notifications] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(notifications, buildPaginationMeta(total, page, limit));
  }

  async markRead(notificationId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const userId = this.tenantContext.getUserId();

    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, organizationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead() {
    const organizationId = this.tenantContext.requireOrganizationId();
    const userId = this.tenantContext.getUserId();

    const result = await this.prisma.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { markedRead: result.count };
  }

  async createForUser(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        title: input.title,
        body: input.body,
        type: input.type ?? 'INFO',
      },
    });

    // Persisted AND pushed: polling clients read the row, live clients get
    // the broadcast. Publishing never throws, so this cannot fail the caller.
    await this.realtime.publish(input.organizationId, 'notification.created', {
      notification,
    });

    return notification;
  }
}
