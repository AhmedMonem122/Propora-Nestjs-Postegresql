import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PropertyStatus, PropertyType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto.js';

export interface PropertyListQuery {
  type?: PropertyType;
  status?: PropertyStatus;
  search?: string;
  city?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll(query: PropertyListQuery) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.PropertyWhereInput = {
      organizationId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.city
        ? { city: { contains: query.city, mode: 'insensitive' } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
              { country: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, properties] = await this.prisma.$transaction([
      this.prisma.property.count({ where }),
      this.prisma.property.findMany({
        where,
        include: { _count: { select: { buildings: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(properties, buildPaginationMeta(total, page, limit));
  }

  async create(dto: CreatePropertyDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    return this.prisma.property.create({
      data: {
        ...dto,
        organizationId,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findOne(propertyId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId },
      include: {
        buildings: {
          include: { _count: { select: { units: true } } },
        },
        _count: { select: { buildings: true } },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }

  async update(propertyId: string, dto: UpdatePropertyDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ...dto,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(propertyId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    await this.prisma.property.delete({ where: { id: propertyId } });

    return { id: propertyId, deleted: true };
  }
}
