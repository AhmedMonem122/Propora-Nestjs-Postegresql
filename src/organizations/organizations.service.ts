import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import { UsersService } from '../users/users.service.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly usersService: UsersService,
  ) {}

  async getOwn() {
    const organizationId = this.tenantContext.requireOrganizationId();

    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { users: true, properties: true, roles: true },
        },
      },
    });
  }

  async updateOwn(dto: UpdateOrganizationDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const existing = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: dto.name,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      include: {
        _count: {
          select: { users: true, properties: true, roles: true },
        },
      },
    });
  }

  async listMembers(query: {
    search?: string;
    status?: UserStatus;
    page?: number;
    limit?: number;
  }) {
    return this.usersService.findAll(query);
  }
}
