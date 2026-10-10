import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { toBoolean } from '../../common/utils/query.util.js';

export class DeliveryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Only successful (or failed) deliveries (?success=false)',
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toBoolean)
  @IsBoolean()
  success?: boolean;
}
