import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import {
  AssignMaintenanceDto,
  CloseMaintenanceDto,
  CreateMaintenanceRequestDto,
  MaintenanceStatusDto,
  UpdateMaintenanceRequestDto,
} from './dto/maintenance.dto.js';

export interface MaintenanceListQuery {
  status?: string;
  priority?: string;
  unitId?: string;
  assignedToId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(query: MaintenanceListQuery) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.MaintenanceRequestWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status as Prisma.EnumMaintenanceStatusFilter } : {}),
      ...(query.priority ? { priority: query.priority as Prisma.EnumMaintenancePriorityFilter } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, requests] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.count({ where }),
      this.prisma.maintenanceRequest.findMany({
        where,
        include: {
          unit: { include: { building: { include: { property: true } } } },
          resident: true,
          assignee: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(requests, buildPaginationMeta(total, page, limit));
  }

  async create(dto: CreateMaintenanceRequestDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, organizationId },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    if (dto.residentId) {
      const resident = await this.prisma.resident.findFirst({
        where: { id: dto.residentId, organizationId },
      });

      if (!resident) {
        throw new NotFoundException('Resident not found');
      }
    }

    return this.prisma.maintenanceRequest.create({
      data: {
        ...dto,
        organizationId,
        priority: dto.priority ?? 'MEDIUM',
        status: 'OPEN',
      },
      include: { unit: true, resident: true, assignee: true },
    });
  }

  async findOne(requestId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
      include: {
        unit: { include: { building: { include: { property: true } } } },
        resident: true,
        assignee: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    return request;
  }

  async update(requestId: string, dto: UpdateMaintenanceRequestDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    return this.prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: { ...dto },
      include: { unit: true, resident: true, assignee: true },
    });
  }

  async assign(requestId: string, dto: AssignMaintenanceDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
      include: { unit: true },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    const assignee = await this.prisma.user.findFirst({
      where: { id: dto.assignedToId, organizationId },
    });

    if (!assignee) {
      throw new BadRequestException(
        'Technician must be a member of your organization',
      );
    }

    const updated = await this.prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        assignedToId: dto.assignedToId,
        scheduledAt: dto.scheduledAt ?? request.scheduledAt,
        status: request.status === 'OPEN' ? 'IN_PROGRESS' : request.status,
      },
      include: { unit: true, resident: true, assignee: true },
    });

    await this.notificationsService.createForUser({
      userId: assignee.id,
      organizationId,
      title: 'New maintenance request assigned',
      body: `"${request.title}" (unit ${request.unit.name}) was assigned to you${
        dto.scheduledAt
          ? `, scheduled at ${dto.scheduledAt.toISOString()}`
          : ''
      }.`,
      type: 'INFO',
    });

    return updated;
  }

  async updateStatus(requestId: string, dto: MaintenanceStatusDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    return this.prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        resolvedAt:
          dto.status === 'RESOLVED'
            ? new Date()
            : dto.status === 'OPEN' || dto.status === 'IN_PROGRESS'
              ? null
              : request.resolvedAt,
      },
      include: { unit: true, resident: true, assignee: true },
    });
  }

  async closeWithDetails(requestId: string, dto: CloseMaintenanceDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    return this.prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        cost: dto.cost,
        notes: dto.notes ?? request.notes,
      },
      include: { unit: true, resident: true, assignee: true },
    });
  }

  async remove(requestId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    await this.prisma.maintenanceRequest.delete({
      where: { id: requestId },
    });

    return { id: requestId, deleted: true };
  }
}
