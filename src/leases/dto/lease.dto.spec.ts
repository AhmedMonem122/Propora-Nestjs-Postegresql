import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLeaseDto } from './lease.dto.js';

async function startDateErrors(startDate: unknown) {
  const dto = plainToInstance(CreateLeaseDto, {
    unitId: 'unit-1',
    residentId: 'resident-1',
    startDate,
    rentAmount: 4500,
  });
  const errors = await validate(dto);
  return errors.filter((error) => error.property === 'startDate');
}

describe('CreateLeaseDto dates', () => {
  it('accepts YYYY-MM-DD dates (date-picker friendly)', async () => {
    await expect(startDateErrors('2026-01-01')).resolves.toHaveLength(0);
  });

  it('accepts full ISO datetimes', async () => {
    await expect(
      startDateErrors('2026-01-01T00:00:00.000Z'),
    ).resolves.toHaveLength(0);
  });

  it('rejects garbage dates', async () => {
    const errors = await startDateErrors('not-a-date');
    expect(errors.length).toBeGreaterThan(0);
  });
});
