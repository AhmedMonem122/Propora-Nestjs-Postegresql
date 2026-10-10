import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeliveryQueryDto } from './delivery-query.dto.js';

/**
 * Regression test: the global ValidationPipe runs with
 * `enableImplicitConversion`, whose Boolean coercion (`Boolean('false')`)
 * used to invert every `=false` filter before `@Transform` ran.
 * These cases mirror the production pipe config exactly.
 */
function transform(query: Record<string, unknown>) {
  return plainToInstance(DeliveryQueryDto, query, {
    enableImplicitConversion: true,
  });
}

describe('DeliveryQueryDto boolean coercion', () => {
  it('keeps ?success=false as false', async () => {
    const dto = transform({ success: 'false' });
    expect(dto.success).toBe(false);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('keeps ?success=true as true', async () => {
    const dto = transform({ success: 'true' });
    expect(dto.success).toBe(true);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('leaves an absent success undefined (no filter applied)', async () => {
    const dto = transform({});
    expect(dto.success).toBeUndefined();
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
