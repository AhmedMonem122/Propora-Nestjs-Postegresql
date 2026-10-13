import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';

describe('CreateUserDto', () => {
  it('accepts invites without roles (roles assigned later)', async () => {
    const dto = plainToInstance(CreateUserDto, {
      firstName: 'No',
      lastName: 'Roles',
      email: 'noroles@example.com',
      password: 'TempStr0ng!Pass1',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
