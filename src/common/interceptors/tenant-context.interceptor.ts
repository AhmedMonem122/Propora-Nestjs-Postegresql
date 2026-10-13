import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../database/prisma.service.js';
import { TenantContextService } from '../../database/tenant-context.service.js';
import { TenantContext } from '../types/tenant-context.interface.js';

export const ORG_OVERRIDE_HEADER = 'x-organization-id';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantContextService: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    let organizationId: string | null = user?.organizationId ?? null;

    // Platform admins may scope ANY request to a tenant (Stripe-Account
    // style) instead of needing per-organization member accounts. The org
    // must exist; everything downstream (queries, audit) then behaves as
    // if the caller belonged to it.
    const override = request.headers?.[ORG_OVERRIDE_HEADER] as
      | string
      | undefined;
    if (override) {
      if (!user) {
        // Anonymous requests have no one to scope: ignore the header.
      } else if (user.isPlatformAdmin !== true) {
        throw new ForbiddenException(
          'X-Organization-Id is reserved for platform administrators',
        );
      } else {
        const organization = await this.prisma.organization.findUnique({
          where: { id: override },
          select: { id: true },
        });
        if (!organization) {
          throw new BadRequestException('Unknown X-Organization-Id');
        }
        organizationId = organization.id;
      }
    }

    const tenantContext: TenantContext = user
      ? {
          userId: user.userId,
          organizationId,
          isPlatformAdmin: !user.organizationId,
        }
      : { userId: null, organizationId: null, isPlatformAdmin: false };

    return this.tenantContextService.run(tenantContext, () => next.handle());
  }
}
