import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async financial() {
    const organizationId = this.tenantContext.requireOrganizationId();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      expectedRent,
      collectedThisMonth,
      outstanding,
      overdue,
      totalUnits,
      occupiedUnits,
      settings,
    ] = await Promise.all([
      this.prisma.lease.aggregate({
        where: { organizationId, status: 'ACTIVE' },
        _sum: { rentAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          organizationId,
          status: 'PAID',
          paidAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { organizationId, status: 'PENDING' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          organizationId,
          status: 'PENDING',
          dueDate: { lt: now },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.unit.count({
        where: { organizationId, status: { not: 'INACTIVE' } },
      }),
      this.prisma.unit.count({
        where: { organizationId, status: 'OCCUPIED' },
      }),
      this.prisma.organizationSetting.findUnique({
        where: { organizationId },
        select: { currency: true },
      }),
    ]);

    return {
      period: {
        from: startOfMonth.toISOString(),
        to: now.toISOString(),
        currency: settings?.currency ?? 'USD',
      },
      expectedMonthlyRent: expectedRent._sum.rentAmount ?? 0,
      collectedThisMonth: collectedThisMonth._sum.amount ?? 0,
      outstanding: {
        amount: outstanding._sum.amount ?? 0,
        count: outstanding._count._all,
      },
      overdue: {
        amount: overdue._sum.amount ?? 0,
        count: overdue._count._all,
      },
      occupancyRate: totalUnits === 0 ? 0 : occupiedUnits / totalUnits,
      units: { total: totalUnits, occupied: occupiedUnits },
    };
  }

  async occupancy() {
    const organizationId = this.tenantContext.requireOrganizationId();

    const properties = await this.prisma.property.findMany({
      where: { organizationId },
      include: {
        buildings: { include: { units: { select: { status: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    const perProperty = properties.map((property) => {
      const units = property.buildings.flatMap(
        (building) => building.units,
      );
      const total = units.length;
      const occupied = units.filter((u) => u.status === 'OCCUPIED').length;
      const vacant = units.filter((u) => u.status === 'VACANT').length;
      const underMaintenance = units.filter(
        (u) => u.status === 'UNDER_MAINTENANCE',
      ).length;

      return {
        propertyId: property.id,
        name: property.name,
        totalUnits: total,
        occupied,
        vacant,
        underMaintenance,
        occupancyRate: total === 0 ? 0 : occupied / total,
      };
    });

    const totals = perProperty.reduce(
      (acc, property) => ({
        totalUnits: acc.totalUnits + property.totalUnits,
        occupied: acc.occupied + property.occupied,
        vacant: acc.vacant + property.vacant,
        underMaintenance: acc.underMaintenance + property.underMaintenance,
      }),
      { totalUnits: 0, occupied: 0, vacant: 0, underMaintenance: 0 },
    );

    return {
      totals: {
        ...totals,
        occupancyRate:
          totals.totalUnits === 0 ? 0 : totals.occupied / totals.totalUnits,
      },
      properties: perProperty,
    };
  }
}
