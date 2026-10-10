import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentMethod, PaymentStatus, PaymentType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { toBoolean } from '../../common/utils/query.util.js';

export class PaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by lease id' })
  @IsString()
  @IsOptional()
  leaseId?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentType })
  @IsEnum(PaymentType)
  @IsOptional()
  type?: PaymentType;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @ApiPropertyOptional({
    example: true,
    description: 'Pending payments past their due date (?overdue=true)',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;
}
