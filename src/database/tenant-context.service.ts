import { ForbiddenException, Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { TenantContext } from '../common/types/tenant-context.interface.js';

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  getContext(): TenantContext | undefined {
    return this.storage.getStore();
  }

  getUserId(): string | null {
    return this.storage.getStore()?.userId ?? null;
  }

  getOrganizationId(): string | null {
    return this.storage.getStore()?.organizationId ?? null;
  }

  isPlatformAdmin(): boolean {
    return this.storage.getStore()?.isPlatformAdmin ?? false;
  }

  requireOrganizationId(): string {
    const organizationId = this.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException(
        'This operation requires an organization context. Platform administrators must act through organization-scoped members.',
      );
    }
    return organizationId;
  }
}
