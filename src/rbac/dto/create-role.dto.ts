import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ROLE_NAME_PATTERN =
  '^[A-Za-z0-9][A-Za-z0-9 _-]{1,62}[A-Za-z0-9]$|^[A-Za-z0-9]{2,3}$';

export class CreateRoleDto {
  @ApiProperty({ example: 'Leasing Agent' })
  @IsString()
  @IsNotEmpty()
  @Matches(ROLE_NAME_PATTERN)
  name: string;

  @ApiPropertyOptional({ example: 'Handles property showings and lease signing' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    type: [String],
    example: ['property:read', 'unit:update', 'lease:create'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsString({ each: true })
  permissions: string[];
}
