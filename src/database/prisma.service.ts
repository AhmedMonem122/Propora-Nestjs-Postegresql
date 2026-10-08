import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 500);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    (this.$on as (event: 'query', cb: (e: Prisma.QueryEvent) => void) => void)(
      'query',
      (event) => {
        if (event.duration >= SLOW_QUERY_MS) {
          this.logger.warn(
            `Slow query (${event.duration}ms): ${event.query.slice(0, 200)}`,
          );
        }
      },
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
