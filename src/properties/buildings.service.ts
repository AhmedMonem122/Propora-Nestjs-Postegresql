import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import { CreateBuildingDto, UpdateBuildingDto } from './dto/building.dto.js';
import { BuildingQueryDto } from './dto/building-query.dto.js';

@Injectable()
export class BuildingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAllByProperty(propertyId: string, query: BuildingQueryDto = {}) {
    const organizationId = this.tenantContext.requireOrganizationId();

    await this.assertPropertyInOrganization(propertyId, organizationId);

    const { page, limit, skip, take } = normalizePagination(query);
    const where: Prisma.BuildingWhereInput = {
      organizationId,
      propertyId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, buildings] = await this.prisma.$transaction([
      this.prisma.building.count({ where }),
      this.prisma.building.findMany({
        where,
        include: { _count: { select: { units: true } } },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
      }),
    ]);

    return paginated(buildings, buildPaginationMeta(total, page, limit));
  }

  async create(propertyId: string, dto: CreateBuildingDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    await this.assertPropertyInOrganization(propertyId, organizationId);

    return this.prisma.building.create({
      data: { ...dto, organizationId, propertyId },
      include: { _count: { select: { units: true } } },
    });
  }

  async findOne(buildingId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, organizationId },
      include: {
        property: true,
        units: { orderBy: { name: 'asc' } },
        _count: { select: { units: true } },
      },
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    return building;
  }

  async update(buildingId: string, dto: UpdateBuildingDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, organizationId },
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    return this.prisma.building.update({
      where: { id: buildingId },
      data: { ...dto },
      include: { _count: { select: { units: true } } },
    });
  }

  async remove(buildingId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, organizationId },
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    await this.prisma.building.delete({ where: { id: buildingId } });

    return { id: buildingId, deleted: true };
  }

  private async assertPropertyInOrganization(
    propertyId: string,
    organizationId: string,
  ): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }
  }
}
