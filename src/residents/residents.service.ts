import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResidentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import { CreateResidentDto, UpdateResidentDto } from './dto/resident.dto.js';

export interface ResidentListQuery {
  search?: string;
  status?: ResidentStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class ResidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll(query: ResidentListQuery) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.ResidentWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, residents] = await this.prisma.$transaction([
      this.prisma.resident.count({ where }),
      this.prisma.resident.findMany({
        where,
        include: { _count: { select: { leases: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(residents, buildPaginationMeta(total, page, limit));
  }

  async create(dto: CreateResidentDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    await this.assertResidentUser(dto.userId, organizationId);

    return this.prisma.resident.create({
      data: { ...dto, organizationId },
    });
  }

  async findOne(residentId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const resident = await this.prisma.resident.findFirst({
      where: { id: residentId, organizationId },
      include: {
        _count: { select: { leases: true } },
        leases: {
          orderBy: { createdAt: 'desc' },
          include: { unit: { include: { building: true } } },
        },
      },
    });

    if (!resident) {
      throw new NotFoundException('Resident not found');
    }

    return resident;
  }

  async update(residentId: string, dto: UpdateResidentDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const resident = await this.prisma.resident.findFirst({
      where: { id: residentId, organizationId },
    });

    if (!resident) {
      throw new NotFoundException('Resident not found');
    }

    await this.assertResidentUser(dto.userId, organizationId, residentId);

    return this.prisma.resident.update({
      where: { id: residentId },
      data: { ...dto },
    });
  }

  async remove(residentId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const resident = await this.prisma.resident.findFirst({
      where: { id: residentId, organizationId },
    });

    if (!resident) {
      throw new NotFoundException('Resident not found');
    }

    await this.prisma.resident.delete({ where: { id: residentId } });

    return { id: residentId, deleted: true };
  }

  /**
   * A resident profile may be linked to exactly one portal account, and that
   * account must belong to the same organization (tenant isolation).
   */
  private async assertResidentUser(
    userId: string | null | undefined,
    organizationId: string,
    excludeResidentId?: string,
  ): Promise<void> {
    if (!userId) {
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(
        'Linked user must be a member of your organization',
      );
    }

    const taken = await this.prisma.resident.findFirst({
      where: {
        userId,
        ...(excludeResidentId ? { id: { not: excludeResidentId } } : {}),
      },
      select: { id: true },
    });

    if (taken) {
      throw new BadRequestException(
        'This user account is already linked to another resident',
      );
    }
  }
}
