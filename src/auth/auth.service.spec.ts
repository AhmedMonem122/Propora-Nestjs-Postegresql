import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import bcryptjs from 'bcryptjs';
import { AuthService } from '../../src/auth/auth.service.js';
import { loadRbacSeedCatalog } from '../../src/rbac/rbac-catalog.loader.js';

const catalog = loadRbacSeedCatalog();

function createMocks(overrides: Record<string, unknown> = {}) {
  const tx = {
    organization: {
      create: vi.fn().mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
      }),
    },
    role: {
      create: vi.fn().mockImplementation(({ data }: { data: { name: string } }) =>
        Promise.resolve({
          id: `role-${data.name}`,
          name: data.name,
          organizationId: 'org-1',
        }),
      ),
    },
    user: {
      create: vi.fn().mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        email: 'test@example.com',
      }),
    },
    userRole: {
      create: vi.fn().mockResolvedValue({}),
    },
    organizationSetting: {
      create: vi.fn().mockResolvedValue({ id: 'settings-1' }),
    },
  };

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        phone: null,
        organizationId: 'org-1',
        status: 'ACTIVE',
        userRoles: [{ role: { name: 'ORGANIZATION_OWNER' } }],
      }),
    },
    organization: {
      create: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    role: { create: vi.fn() },
    userRole: { create: vi.fn() },
    refreshToken: {
      create: vi.fn().mockResolvedValue({ id: 'rt-1' }),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 'rt-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    passwordResetToken: {
      create: vi.fn().mockResolvedValue({ id: 'prt-1' }),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 'prt-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'prt-1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    ...overrides,
  };

  const jwtService = {
    sign: vi.fn().mockReturnValue('jwt-access-token'),
  };

  const configService = {
    get: vi.fn((key: string, defaultValue?: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
        BCRYPT_SALT_ROUNDS: '12',
        NODE_ENV: 'test',
      };
      return values[key] ?? defaultValue;
    }),
  };

  const rbacService = {
    getUserPermissions: vi.fn(),
    invalidateUserCache: vi.fn(),
  };

  const events = {
    emit: vi.fn().mockResolvedValue(undefined),
  };

  const audit = {
    log: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };

  return { prisma, jwtService, configService, rbacService, events, audit, tx };
}

function createService(overrides: Record<string, unknown> = {}) {
  const mocks = createMocks(overrides);
  const service = new AuthService(
    mocks.prisma as never,
    mocks.jwtService as never,
    mocks.configService as never,
    mocks.rbacService as never,
    mocks.events as never,
    mocks.audit as never,
  );
  return { service, ...mocks };
}

describe('AuthService', () => {
  describe('register', () => {
    it('creates the organization, owner user and system roles in a transaction', async () => {
      const { service, prisma, tx } = createService();
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          id: 'user-1',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          phone: null,
          organizationId: 'org-1',
          status: 'ACTIVE',
          userRoles: [{ role: { name: 'ORGANIZATION_OWNER' } }],
        });

      await service.register({
        organizationName: 'Test Org',
        firstName: 'Test',
        lastName: 'User',
        email: 'TEST@example.com',
        password: 'Password123!',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tx.organization.create).toHaveBeenCalledWith({
        data: { name: 'Test Org', slug: 'test-org' },
      });
      expect(tx.role.create).toHaveBeenCalledTimes(
        catalog.roleTemplates.length,
      );
      expect(tx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            organizationId: 'org-1',
          }),
        }),
      );
      expect(bcryptjs.hash).toHaveBeenCalledWith('Password123!', 12);
    });

    it('rejects an email that is already registered', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          organizationName: 'Test Org',
          firstName: 'Test',
          lastName: 'User',
          email: 'taken@example.com',
          password: 'Password123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('issues tokens for valid credentials and an active account', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
        firstName: 'Test',
        lastName: 'User',
        phone: null,
        organization: { id: 'org-1', status: 'ACTIVE' },
        userRoles: [{ role: { name: 'ORGANIZATION_OWNER' } }],
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'Password123!',
      } as never);

      expect(result.tokens.accessToken).toBe('jwt-access-token');
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.user.roles).toContain('ORGANIZATION_OWNER');
    });

    it('rejects a suspended organization', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
        organization: { id: 'org-1', status: 'SUSPENDED' },
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'Password123!',
        } as never),
      ).rejects.toThrow(/suspended/i);
    });
  });

  describe('refresh', () => {
    it('rotates a valid refresh token', async () => {
      const { service, prisma } = createService();
      const future = new Date(Date.now() + 86400000);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: future,
        revokedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        email: 'test@example.com',
        status: 'ACTIVE',
      });

      const result = await service.refresh('some-refresh-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(result.tokens.accessToken).toBe('jwt-access-token');
    });

    it('rejects an expired refresh token', async () => {
      const { service, prisma } = createService();

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 86400000),
        revokedAt: null,
      });

      await expect(service.refresh('expired-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an access token presented as a refresh token', async () => {
      const { service, prisma } = createService();
      const accessToken =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJl';

      await expect(service.refresh(accessToken)).rejects.toThrow(
        /access tokens are not accepted/i,
      );
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('revokes the whole token family when a rotated token is reused', async () => {
      const { service, prisma } = createService();

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        platformAdminId: null,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: new Date(Date.now() - 1000),
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      prisma.user.update.mockResolvedValue({ id: 'user-1' });

      await expect(service.refresh('stolen-refresh-token')).rejects.toThrow(
        /reuse detected/i,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { tokenVersion: { increment: 1 } },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('password recovery', () => {
    it('stays silent for unknown emails (no enumeration)', async () => {
      const { service, prisma, events } = createService();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset({ email: 'nobody@example.com' } as never),
      ).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('creates a hashed single-use code and emits the email event', async () => {
      const { service, prisma, events } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        status: 'ACTIVE',
        organizationId: 'org-1',
      });

      await service.requestPasswordReset({
        email: 'test@example.com',
      } as never);

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          expiresAt: expect.any(Date),
        }),
      });
      const created =
        prisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(created.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(events.emit).toHaveBeenCalledWith(
        'user.passwordResetRequested',
        expect.objectContaining({ email: 'test@example.com' }),
      );
    });

    it('rejects a wrong code and counts the attempt', async () => {
      const { service, prisma } = createService();
      const { createHash } = await import('node:crypto');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      });
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'prt-1',
        tokenHash: createHash('sha256').update('482916').digest('hex'),
        attempts: 0,
      });

      await expect(
        service.resetPassword({
          email: 'test@example.com',
          otp: '000000',
          newPassword: 'NewStr0ng!Pass',
        } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('resets the password with the right code and logs the user in', async () => {
      const { service, prisma, events } = createService();
      const { createHash } = await import('node:crypto');
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'test@example.com',
          organizationId: 'org-1',
          tokenVersion: 0,
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          phone: null,
          organizationId: 'org-1',
          status: 'ACTIVE',
          userRoles: [],
        });
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'prt-1',
        tokenHash: createHash('sha256').update('482916').digest('hex'),
        attempts: 0,
      });

      const result = await service.resetPassword({
        email: 'test@example.com',
        otp: '482916',
        newPassword: 'NewStr0ng!Pass',
      } as never);

      expect(result.tokens.accessToken).toBe('jwt-access-token');
      expect(result.tokens.refreshToken).toBeDefined();
      expect(events.emit).toHaveBeenCalledWith(
        'user.passwordChanged',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });

  describe('self-service account lifecycle', () => {
    it('soft-deletes the account and reactivates it on next login', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'user-1', organizationId: 'org-1' })
        .mockResolvedValueOnce({
          id: 'user-1',
          organizationId: 'org-1',
          email: 'test@example.com',
          passwordHash: 'hashed-password',
          status: 'INACTIVE',
          deletedAt: new Date(),
          tokenVersion: 1,
          organization: { id: 'org-1', status: 'ACTIVE' },
          userRoles: [],
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          phone: null,
          organizationId: 'org-1',
          status: 'ACTIVE',
          userRoles: [],
        });

      await service.deleteMe('user-1');
      expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'user-1' },
        data: {
          status: 'INACTIVE',
          deletedAt: expect.any(Date),
          tokenVersion: { increment: 1 },
        },
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'Password123!',
      } as never);

      expect(result.tokens.accessToken).toBe('jwt-access-token');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          deletedAt: null,
        }),
      });
    });

    it('keeps admin-deactivated accounts blocked', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        status: 'INACTIVE',
        deletedAt: null,
        organization: { id: 'org-1', status: 'ACTIVE' },
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'Password123!',
        } as never),
      ).rejects.toThrow(/deactivated by an administrator/i);
    });

    it('updates the own profile', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'New',
        lastName: 'Name',
        phone: null,
        organizationId: 'org-1',
        status: 'ACTIVE',
        userRoles: [],
      });

      const result = await service.updateMe('user-1', {
        firstName: 'New',
        lastName: 'Name',
      } as never);

      expect(result.firstName).toBe('New');
    });
  });

  describe('changePassword', () => {
    it('revokes all refresh tokens after a password change', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
      });

      await service.changePassword('user-1', {
        currentPassword: 'Password123!',
        newPassword: 'NewPassword123!',
      } as never);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
