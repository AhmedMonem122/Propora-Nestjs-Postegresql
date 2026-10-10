import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ResidentStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ResidentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name, email or phone' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ResidentStatus })
  @IsEnum(ResidentStatus)
  @IsOptional()
  status?: ResidentStatus;
}
