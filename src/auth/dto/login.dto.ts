import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LOGIN_ROLES,
  type LoginRole,
} from '../../common/constants/organization.constants.js';

export class LoginDto {
  @ApiProperty({ example: 'ahmed@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SuperSecret123!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    enum: LOGIN_ROLES,
    description:
      'Role you intend to work as. The server verifies you actually hold it: ' +
      'ADMIN signs you into the platform session, any other role must exist ' +
      'on your organization membership (403 otherwise). Omit to skip the check.',
  })
  @IsIn(LOGIN_ROLES)
  @IsOptional()
  role?: LoginRole;
}
