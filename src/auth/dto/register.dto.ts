import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  REGISTER_ROLES,
  type RegisterRole,
} from '../../common/constants/organization.constants.js';

export class RegisterDto {
  @ApiPropertyOptional({
    description:
      'Join-code path: register straight into an existing organization. ' +
      'When present, organizationName is ignored.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  inviteCode?: string;

  @ApiProperty({ example: 'Sunrise Properties' })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  organizationName?: string;

  @ApiPropertyOptional({
    enum: REGISTER_ROLES,
    default: 'OWNER',
    description:
      'Requested role. OWNER creates a new organization; any other role ' +
      'requires an inviteCode. "ADMIN" is not accepted here (400).',
  })
  @IsIn(REGISTER_ROLES)
  @IsOptional()
  role?: RegisterRole;

  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Monem' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ example: 'ahmed@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ minLength: 8, example: 'SuperSecret123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;
}
