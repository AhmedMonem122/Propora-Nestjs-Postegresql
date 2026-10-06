import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty({ example: 4500 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'EGP' })
  @IsString()
  @Length(3, 3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  @Type(() => Date)
  dueDate: Date;

  @ApiPropertyOptional({ example: '2026-10-28' })
  @IsDateString()
  @Type(() => Date)
  @IsOptional()
  paidAt?: Date | null;

  @ApiPropertyOptional({ example: 'INV-2026-001' })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  invoiceNo?: string;

  @ApiPropertyOptional({ example: 'October rent' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class UpdatePaymentDto {
  @ApiPropertyOptional({ example: 4500 })
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ example: 'EGP' })
  @IsString()
  @Length(3, 3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsDateString()
  @Type(() => Date)
  @IsOptional()
  dueDate?: Date;

  @ApiPropertyOptional({ example: '2026-10-28' })
  @IsDateString()
  @Type(() => Date)
  @IsOptional()
  paidAt?: Date | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(40)
  @IsOptional()
  invoiceNo?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
