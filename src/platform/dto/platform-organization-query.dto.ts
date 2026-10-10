import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrganizationStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class PlatformOrganizationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrganizationStatus })
  @IsEnum(OrganizationStatus)
  @IsOptional()
  status?: OrganizationStatus;

  @ApiPropertyOptional({ description: 'Search name or slug' })
  @IsString()
  @IsOptional()
  search?: string;
}
