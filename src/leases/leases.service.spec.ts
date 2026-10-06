import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LeasesService } from '../../src/leases/leases.service.js';

function createService(overlappingLease: unknown) {
  const leaseDelegate = {
    findFirst: vi.fn().mockResolvedValue(overlappingLease),
    create: vi.fn().mockResolvedValue({ id: 'lease-new' }),
    update: vi.fn().mockResolvedValue({ id: 'lease-1' }),
  };

  const tx = {
    lease: leaseDelegate,
  };

  const prisma = {
    unit: {
      findFirst: vi.fn().mockResolvedValue({ id: 'unit-1' }),
    },
    resident: {
      findFirst: vi.fn().mockResolvedValue({ id: 'resident-1' }),
    },
    lease: leaseDelegate,
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };

  const tenantContext = {
    requireOrganizationId: vi.fn().mockReturnValue('org-1'),
  };

  const service = new LeasesService(
    prisma as never,
    tenantContext as never,
  );

  return { service, prisma, leaseDelegate };
}

const createDto = {
  unitId: 'unit-1',
  residentId: 'resident-1',
  startDate: new Date('2026-11-01T00:00:00Z'),
  endDate: new Date('2027-11-01T00:00:00Z'),
  rentAmount: 4500,
};

describe('LeasesService', () => {
  it('creates a lease when there is no overlapping active lease', async () => {
    const { service, leaseDelegate } = createService(null);

    const lease = await service.create(createDto as never);

    expect(lease).toEqual({ id: 'lease-new' });
    expect(leaseDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitId: 'unit-1',
          status: 'UPCOMING',
          depositAmount: 0,
        }),
      }),
    );
  });

  it('rejects a lease that overlaps an existing active lease', async () => {
    const overlapping = {
      id: 'lease-existing',
      status: 'ACTIVE',
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2027-01-01T00:00:00Z'),
    };
    const { service } = createService(overlapping);

    await expect(service.create(createDto as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a lease that overlaps an open-ended lease', async () => {
    const overlapping = {
      id: 'lease-open-ended',
      status: 'ACTIVE',
      startDate: new Date('2025-06-01T00:00:00Z'),
      endDate: null,
    };
    const { service } = createService(overlapping);

    await expect(service.create(createDto as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects an end date that is not after the start date', async () => {
    const { service } = createService(null);

    await expect(
      service.create({
        ...createDto,
        endDate: new Date('2026-10-01T00:00:00Z'),
      } as never),
    ).rejects.toThrow(/after the start date/i);
  });

  it('rejects a lease for an unknown unit', async () => {
    const { service, prisma } = createService(null);
    prisma.unit.findFirst.mockResolvedValue(null);

    await expect(service.create(createDto as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
