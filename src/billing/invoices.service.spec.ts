import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { InvoicesService } from './invoices.service.js';

function createService() {
  const payment = {
    id: 'pay_abcdef123456',
    organizationId: 'org-1',
    leaseId: 'lease-1',
    amount: new Prisma.Decimal('4500.00'),
    currency: 'EGP',
    type: 'RENT',
    method: 'BANK_TRANSFER',
    status: 'PAID',
    dueDate: new Date('2026-11-01T00:00:00.000Z'),
    paidAt: new Date('2026-10-28T00:00:00.000Z'),
    invoiceNo: null,
    transactionId: 'txn_1',
    lease: {
      id: 'lease-1',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      resident: {
        firstName: 'Ahmed',
        lastName: 'Ali',
        email: 'ahmed@example.com',
      },
      unit: {
        name: 'A-101',
        building: { property: { name: 'Sunrise' } },
      },
    },
    organization: {
      name: 'Sunrise LLC',
      settings: { currency: 'EGP', taxNumber: 'TAX-1' },
    },
  };

  const prisma = {
    payment: {
      findUnique: vi.fn().mockResolvedValue(payment),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...payment, ...data }),
        ),
    },
    document: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const supabase = { isConfigured: () => false };

  return {
    service: new InvoicesService(prisma as never, supabase as never),
    prisma,
  };
}

describe('InvoicesService', () => {
  it('renders a PDF invoice and assigns a deterministic invoice number', async () => {
    const { service, prisma } = createService();

    const result = await service.generateForPayment('pay_abcdef123456');

    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.invoiceNo).toMatch(/^INV-\d{4}-[A-Z0-9]{6}$/);
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay_abcdef123456' },
      data: { invoiceNo: result.invoiceNo },
    });
    expect(result.url).toBeNull();
    expect(result.documentId).toBeNull();
  });
});
