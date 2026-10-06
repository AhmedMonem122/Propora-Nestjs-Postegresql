import { Injectable, NotFoundException } from '@nestjs/common';
import { UnitStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
  PaginationParams,
} from '../common/utils/pagination.util.js';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto.js';

export interface UnitListQuery {
  status?: UnitStatus;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAllByBuilding(buildingId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    await this.assertBuildingInOrganization(buildingId, organizationId);

    return this.prisma.unit.findMany({
      where: { organizationId, buildingId },
      orderBy: { name: 'asc' },
    });
  }

  async findAllByProperty(propertyId: string, query: PaginationParams = {}) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const { page, limit, skip, take } = normalizePagination(query);

    const [total, units] = await this.prisma.$transaction([
      this.prisma.unit.count({
        where: { organizationId, building: { propertyId } },
      }),
      this.prisma.unit.findMany({
        where: { organizationId, building: { propertyId } },
        include: { building: { select: { name: true, code: true } } },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
    ]);

    return paginated(units, buildPaginationMeta(total, page, limit));
  }

  async create(buildingId: string, dto: CreateUnitDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    await this.assertBuildingInOrganization(buildingId, organizationId);

    return this.prisma.unit.create({
      data: { ...dto, organizationId, buildingId },
    });
  }

  async findOne(unitId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, organizationId },
      include: {
        building: {
          include: { property: { select: { name: true, id: true } } },
        },
        leases: {
          orderBy: { createdAt: 'desc' },
          include: { resident: true },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    return unit;
  }

  async update(unitId: string, dto: UpdateUnitDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, organizationId },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    return this.prisma.unit.update({
      where: { id: unitId },
      data: { ...dto },
    });
  }

  async remove(unitId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, organizationId },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    await this.prisma.unit.delete({ where: { id: unitId } });

    return { id: unitId, deleted: true };
  }

  private async assertBuildingInOrganization(
    buildingId: string,
    organizationId: string,
  ): Promise<void> {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, organizationId },
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }
  }
}
