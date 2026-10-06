import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loadRbacSeedCatalog } from '../rbac/rbac-catalog.loader.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.ensurePermissionCatalog();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async ensurePermissionCatalog() {
    const catalog = loadRbacSeedCatalog();
    for (const permission of catalog.permissions) {
      await this.permission.upsert({
        where: { name: permission.name },
        update: {},
        create: permission,
      });
    }
  }
}
