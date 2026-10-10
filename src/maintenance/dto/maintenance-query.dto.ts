import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MaintenancePriority, MaintenanceStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class MaintenanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MaintenanceStatus })
  @IsEnum(MaintenanceStatus)
  @IsOptional()
  status?: MaintenanceStatus;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsEnum(MaintenancePriority)
  @IsOptional()
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ description: 'Filter by unit id' })
  @IsString()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Filter by assignee user id' })
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Search in title and description' })
  @IsString()
  @IsOptional()
  search?: string;
}
