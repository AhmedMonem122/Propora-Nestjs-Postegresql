import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from './permissions.guard.js';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
} from '../decorators/require-permissions.decorator.js';

const makeContext = (userId?: string) => ({
  getHandler: () => ({}),
  getClass: () => ({}),
  switchToHttp: () => ({
    getRequest: () => ({
      user: userId ? { userId } : undefined,
    }),
  }),
});

describe('PermissionsGuard', () => {
  it('allows requests without permission metadata', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    };
    const rbacService = {
      getUserPermissions: vi.fn(),
    };
    const guard = new PermissionsGuard(
      reflector as never,
      rbacService as never,
    );

    const result = await guard.canActivate(makeContext('user-1') as never);

    expect(result).toBe(true);
    expect(rbacService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('allows access when all required permissions are granted', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === PERMISSIONS_KEY
          ? ['property:read', 'property:create']
          : undefined,
      ),
    };
    const rbacService = {
      getUserPermissions: vi
        .fn()
        .mockResolvedValue(
          new Set(['property:read', 'property:create', 'unit:read']),
        ),
    };
    const guard = new PermissionsGuard(
      reflector as never,
      rbacService as never,
    );

    const result = await guard.canActivate(makeContext('user-1') as never);

    expect(result).toBe(true);
  });

  it('denies access when a required permission is missing', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === PERMISSIONS_KEY ? ['property:delete'] : undefined,
      ),
    };
    const rbacService = {
      getUserPermissions: vi.fn().mockResolvedValue(new Set(['property:read'])),
    };
    const guard = new PermissionsGuard(
      reflector as never,
      rbacService as never,
    );

    await expect(
      guard.canActivate(makeContext('user-1') as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires authentication when no user is present', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === PERMISSIONS_KEY ? ['property:read'] : undefined,
      ),
    };
    const rbacService = {
      getUserPermissions: vi.fn(),
    };
    const guard = new PermissionsGuard(
      reflector as never,
      rbacService as never,
    );

    await expect(
      guard.canActivate(makeContext(undefined) as never),
    ).rejects.toThrow();
  });

  it('supports any-of permission mode', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => {
        if (key === PERMISSIONS_KEY) {
          return ['report:financial', 'report:occupancy'];
        }
        if (key === PERMISSIONS_MODE_KEY) {
          return 'any';
        }
        return undefined;
      }),
    };
    const rbacService = {
      getUserPermissions: vi
        .fn()
        .mockResolvedValue(new Set(['report:occupancy'])),
    };
    const guard = new PermissionsGuard(
      reflector as never,
      rbacService as never,
    );

    const result = await guard.canActivate(makeContext('user-1') as never);

    expect(result).toBe(true);
  });
});
