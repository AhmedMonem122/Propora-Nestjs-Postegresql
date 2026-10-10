import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UnitStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class UnitQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name or unit number' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsEnum(UnitStatus)
  @IsOptional()
  status?: UnitStatus;
}
