import {
  IsString,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const ROLE_NAME_PATTERN =
  '^[A-Za-z0-9][A-Za-z0-9 _-]{1,62}[A-Za-z0-9]$|^[A-Za-z0-9]{2,3}$';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Leasing Specialist' })
  @IsString()
  @IsOptional()
  @Matches(ROLE_NAME_PATTERN)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['property:read', 'unit:update', 'lease:create'],
  })
  @IsOptional()
  @IsString({ each: true })
  permissions?: string[];
}
