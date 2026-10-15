import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import { UsersService } from '../users/users.service.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto.js';

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
        settings: true,
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
        description: dto.description,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      include: {
        settings: true,
        _count: {
          select: { users: true, properties: true, roles: true },
        },
      },
    });
  }

  async getSettings() {
    const organizationId = this.tenantContext.requireOrganizationId();

    const settings = await this.prisma.organizationSetting.findUnique({
      where: { organizationId },
    });

    if (!settings) {
      throw new NotFoundException('Organization settings not found');
    }

    return settings;
  }

  async updateSettings(dto: UpdateOrganizationSettingsDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    return this.prisma.organizationSetting.upsert({
      where: { organizationId },
      update: {
        logoUrl: dto.logoUrl,
        timezone: dto.timezone,
        currency: dto.currency,
        language: dto.language,
        taxNumber: dto.taxNumber,
      },
      create: {
        organizationId,
        logoUrl: dto.logoUrl,
        timezone: dto.timezone,
        currency: dto.currency,
        language: dto.language,
        taxNumber: dto.taxNumber,
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

  /**
   * Public join code for this org. Minted lazily so organizations created
   * before invite codes existed get one on first read — no backfill needed.
   */
  async getInviteCode(): Promise<{ inviteCode: string }> {
    const organizationId = this.tenantContext.requireOrganizationId();

    const existing = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { inviteCode: true },
    });

    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    if (existing.inviteCode) {
      return { inviteCode: existing.inviteCode };
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { inviteCode: await this.uniqueInviteCode() },
      select: { inviteCode: true },
    });

    return { inviteCode: updated.inviteCode as string };
  }

  async regenerateInviteCode(): Promise<{ inviteCode: string }> {
    const organizationId = this.tenantContext.requireOrganizationId();

    const existing = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { inviteCode: await this.uniqueInviteCode() },
      select: { inviteCode: true },
    });

    return { inviteCode: updated.inviteCode as string };
  }

  private async uniqueInviteCode(): Promise<string> {
    const { randomBytes } = await import('node:crypto');
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(18).toString('base64url');
      const clash = await this.prisma.organization.findUnique({
        where: { inviteCode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new Error('Could not mint a unique organization invite code');
  }
}
