import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ResidentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name, email or phone' })
  @IsString()
  @IsOptional()
  search?: string;
}
