import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class BuildingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name or code' })
  @IsString()
  @IsOptional()
  search?: string;
}
