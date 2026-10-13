import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { toBoolean } from '../../common/utils/query.util.js';

export class NotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Only unread notifications (?unreadOnly=true)',
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toBoolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ description: 'Search title and body' })
  @IsString()
  @IsOptional()
  search?: string;
}
