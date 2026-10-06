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
  @IsInt()
  @IsOptional()
  totalFloors?: number;

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
  @IsInt()
  @IsOptional()
  totalFloors?: number;

  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;
}
