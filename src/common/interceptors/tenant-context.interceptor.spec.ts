import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';

function createInterceptor(orgExists: boolean) {
  const tenant = {
    run: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  };
  const prisma = {
    organization: {
      findUnique: vi.fn().mockResolvedValue(
        orgExists ? { id: 'org-1' } : null,
      ),
    },
  };
  const interceptor = new TenantContextInterceptor(
    tenant as never,
    prisma as never,
  );
  return { interceptor, tenant, prisma };
}

function contextOf(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

const next = { handle: () => of('ok') } as never;

describe('TenantContextInterceptor organization override', () => {
  it('scopes platform admins to the header organization', async () => {
    const { interceptor, tenant } = createInterceptor(true);
    const request = {
      user: {
        userId: null,
        platformAdminId: 'admin-1',
        organizationId: null,
        isPlatformAdmin: true,
      },
      headers: { 'x-organization-id': 'org-1' },
    };

    await interceptor.intercept(contextOf(request), next);

    expect(tenant.run).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      expect.any(Function),
    );
  });

  it('rejects the header for organization members', async () => {
    const { interceptor } = createInterceptor(true);
    const request = {
      user: { userId: 'u-1', organizationId: 'org-a', isPlatformAdmin: false },
      headers: { 'x-organization-id': 'org-b' },
    };

    await expect(
      interceptor.intercept(contextOf(request), next),
    ).rejects.toThrow(/reserved for platform administrators/i);
  });

  it('rejects unknown organizations', async () => {
    const { interceptor } = createInterceptor(false);
    const request = {
      user: { isPlatformAdmin: true, organizationId: null },
      headers: { 'x-organization-id': 'nope' },
    };

    await expect(
      interceptor.intercept(contextOf(request), next),
    ).rejects.toThrow(/unknown X-Organization-Id/i);
  });

  it('passes normal members through untouched', async () => {
    const { interceptor, tenant, prisma } = createInterceptor(true);
    const request = {
      user: { userId: 'u-1', organizationId: 'org-a', isPlatformAdmin: false },
      headers: {},
    };

    await interceptor.intercept(contextOf(request), next);

    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(tenant.run).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-a' }),
      expect.any(Function),
    );
  });
});
