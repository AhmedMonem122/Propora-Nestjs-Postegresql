import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PropertyStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { emptyToUndefined } from '../../common/utils/transform.util.js';

export class CreateBuildingDto {
  @ApiProperty({ example: 'Building A' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 5 })
  @Transform(emptyToUndefined)
  @IsInt()
  @IsOptional()
  totalFloors?: number;

  @ApiPropertyOptional({ example: '12 Nile Corniche, Tower B entrance' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Residential tower with 2 elevators' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;
}

export class UpdateBuildingDto {
  @ApiPropertyOptional({ example: 'Building A - North' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 6 })
  @Transform(emptyToUndefined)
  @IsInt()
  @IsOptional()
  totalFloors?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;
}
