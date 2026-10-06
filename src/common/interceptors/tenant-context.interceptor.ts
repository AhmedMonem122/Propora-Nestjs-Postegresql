import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from '../../database/tenant-context.service.js';
import { TenantContext } from '../types/tenant-context.interface.js';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContextService: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const tenantContext: TenantContext = user
      ? {
          userId: user.userId,
          organizationId: user.organizationId ?? null,
          isPlatformAdmin: !user.organizationId,
        }
      : { userId: null, organizationId: null, isPlatformAdmin: false };

    return this.tenantContextService.run(tenantContext, () => next.handle());
  }
}
