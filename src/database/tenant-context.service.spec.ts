import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { TenantContextService } from '../../src/database/tenant-context.service.js';

describe('TenantContextService', () => {
  it('exposes the context inside run()', () => {
    const service = new TenantContextService();
    const organizationId = 'org-1';

    const result = service.run(
      {
        userId: 'user-1',
        organizationId,
        isPlatformAdmin: false,
      },
      () => service.getOrganizationId(),
    );

    expect(result).toBe(organizationId);
  });

  it('returns undefined outside of the context', () => {
    const service = new TenantContextService();

    expect(service.getOrganizationId()).toBeNull();
    expect(service.isPlatformAdmin()).toBe(false);
  });

  it('propagates through async calls', async () => {
    const service = new TenantContextService();

    const result = await service.run(
      {
        userId: 'user-1',
        organizationId: 'org-1',
        isPlatformAdmin: false,
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return service.requireOrganizationId();
      },
    );

    expect(result).toBe('org-1');
  });

  it('throws when organization context is required but missing', () => {
    const service = new TenantContextService();

    expect(() => service.requireOrganizationId()).toThrow(
      ForbiddenException,
    );
  });
});
