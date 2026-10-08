import { describe, expect, it } from 'vitest';
import { of, firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';
import { DecimalInterceptor } from './decimal.interceptor.js';

function runThrough(data: unknown) {
  const interceptor = new DecimalInterceptor();
  return firstValueFrom(
    interceptor.intercept({} as never, { handle: () => of(data) }),
  );
}

describe('DecimalInterceptor', () => {
  it('converts Prisma Decimal values to numbers', async () => {
    const result = (await runThrough({
      amount: new Prisma.Decimal('1500.50'),
      nested: { cost: new Prisma.Decimal('10.25') },
      list: [new Prisma.Decimal('1.5')],
    })) as {
      amount: unknown;
      nested: { cost: unknown };
      list: unknown[];
    };

    expect(result.amount).toBe(1500.5);
    expect(result.nested.cost).toBe(10.25);
    expect(result.list[0]).toBe(1.5);
  });

  it('leaves dates, strings and nulls untouched', async () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const result = (await runThrough({
      at: date,
      name: 'x',
      missing: null,
    })) as { at: unknown; name: unknown; missing: unknown };

    expect(result.at).toBe(date);
    expect(result.name).toBe('x');
    expect(result.missing).toBeNull();
  });
});
