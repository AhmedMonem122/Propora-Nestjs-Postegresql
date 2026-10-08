import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import {
  CreateUnitTypeDto,
  UpdateUnitTypeDto,
} from './dto/unit-type.dto.js';

/**
 * Global unit-type catalog (STUDIO, 1BR, …). Shared across tenants;
 * readable by every organization member, manageable by platform admins.
 */
@Injectable()
export class UnitTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.unitType.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateUnitTypeDto) {
    const existing = await this.prisma.unitType.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('A unit type with this name already exists');
    }
    return this.prisma.unitType.create({ data: dto });
  }

  async update(id: string, dto: UpdateUnitTypeDto) {
    const existing = await this.prisma.unitType.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Unit type not found');
    }
    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.unitType.findUnique({
        where: { name: dto.name },
      });
      if (clash) {
        throw new ConflictException('A unit type with this name already exists');
      }
    }
    return this.prisma.unitType.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.unitType.findUnique({
      where: { id },
      include: { _count: { select: { units: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Unit type not found');
    }
    // Units keep working: the FK is SetNull, history is preserved.
    await this.prisma.unitType.delete({ where: { id } });
    return { id, deleted: true, detachedUnits: existing._count.units };
  }
}
