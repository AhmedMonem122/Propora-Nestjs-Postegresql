import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CloseMaintenanceDto } from './maintenance.dto.js';

describe('CloseMaintenanceDto', () => {
  it('treats a cleared cost input as absent (not a 400)', async () => {
    const dto = plainToInstance(CloseMaintenanceDto, { cost: '' });
    expect(dto.cost).toBeUndefined();
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('still accepts a real cost', async () => {
    const dto = plainToInstance(CloseMaintenanceDto, { cost: 350 });
    expect(dto.cost).toBe(350);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
