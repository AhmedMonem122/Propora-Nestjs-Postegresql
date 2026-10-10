import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LeaseStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class LeaseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by unit id' })
  @IsString()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Filter by resident id' })
  @IsString()
  @IsOptional()
  residentId?: string;

  @ApiPropertyOptional({ enum: LeaseStatus })
  @IsEnum(LeaseStatus)
  @IsOptional()
  status?: LeaseStatus;
}
