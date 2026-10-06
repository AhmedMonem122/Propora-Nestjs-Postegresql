import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UnitStatus } from '@prisma/client';

export class CreateUnitDto {
  @ApiProperty({ example: 'Apartment 101' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: '101' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  unitNumber?: string;

  @ApiPropertyOptional({ example: '2 Bedroom' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @IsOptional()
  bedrooms?: number;

  @ApiPropertyOptional({ example: 1.5 })
  @IsNumber()
  @IsOptional()
  bathrooms?: number;

  @ApiPropertyOptional({ example: 120.5 })
  @IsNumber()
  @IsOptional()
  areaSqm?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  floor?: number;

  @ApiPropertyOptional({ example: 4500 })
  @IsNumber()
  @IsOptional()
  rentAmount?: number;

  @ApiPropertyOptional({ example: 9000 })
  @IsNumber()
  @IsOptional()
  depositAmount?: number;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsEnum(UnitStatus)
  @IsOptional()
  status?: UnitStatus;

  @ApiPropertyOptional({ example: 'Corner unit with Nile view' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;
}

export class UpdateUnitDto {
  @ApiPropertyOptional({ example: 'Apartment 101' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '101' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  unitNumber?: string;

  @ApiPropertyOptional({ example: '2 Bedroom' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @IsOptional()
  bedrooms?: number;

  @ApiPropertyOptional({ example: 1.5 })
  @IsNumber()
  @IsOptional()
  bathrooms?: number;

  @ApiPropertyOptional({ example: 120.5 })
  @IsNumber()
  @IsOptional()
  areaSqm?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  floor?: number;

  @ApiPropertyOptional({ example: 4600 })
  @IsNumber()
  @IsOptional()
  rentAmount?: number;

  @ApiPropertyOptional({ example: 9200 })
  @IsNumber()
  @IsOptional()
  depositAmount?: number;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsEnum(UnitStatus)
  @IsOptional()
  status?: UnitStatus;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;
}
