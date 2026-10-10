import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PropertyStatus, PropertyType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class PropertyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PropertyType })
  @IsEnum(PropertyType)
  @IsOptional()
  type?: PropertyType;

  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;

  @ApiPropertyOptional({ description: 'Search name or address' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsString()
  @IsOptional()
  city?: string;
}
