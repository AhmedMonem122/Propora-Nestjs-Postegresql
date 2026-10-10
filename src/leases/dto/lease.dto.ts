import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseStatus, PaymentFrequency } from '@prisma/client';

export class CreateLeaseDto {
  @ApiProperty({ example: 'cm4x-unit-id' })
  @IsString()
  @MinLength(1)
  unitId: string;

  @ApiProperty({ example: 'cm4y-resident-id' })
  @IsString()
  @MinLength(1)
  residentId: string;

  @ApiProperty({ example: '2026-11-01' })
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @ApiPropertyOptional({ example: '2027-11-01' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  endDate?: Date | null;

  @ApiProperty({ example: 4500 })
  @IsNumber()
  @Min(0.01)
  rentAmount: number;

  @ApiPropertyOptional({ example: 9000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  depositAmount?: number;

  @ApiPropertyOptional({ enum: PaymentFrequency })
  @IsEnum(PaymentFrequency)
  @IsOptional()
  paymentFrequency?: PaymentFrequency;

  @ApiPropertyOptional({ enum: LeaseStatus })
  @IsEnum(LeaseStatus)
  @IsOptional()
  status?: LeaseStatus;

  @ApiPropertyOptional({ example: 'Signed via email' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class UpdateLeaseDto {
  @ApiPropertyOptional({ example: 'cm4z-other-unit-id' })
  @IsString()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ example: 'cm4z-other-resident-id' })
  @IsString()
  @IsOptional()
  residentId?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional({ example: '2027-11-01' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  endDate?: Date | null;

  @ApiPropertyOptional({ example: 4600 })
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  rentAmount?: number;

  @ApiPropertyOptional({ example: 9200 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  depositAmount?: number;

  @ApiPropertyOptional({ enum: PaymentFrequency })
  @IsEnum(PaymentFrequency)
  @IsOptional()
  paymentFrequency?: PaymentFrequency;

  @ApiPropertyOptional({ enum: LeaseStatus })
  @IsEnum(LeaseStatus)
  @IsOptional()
  status?: LeaseStatus;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class LeaseStatusDto {
  @ApiProperty({ enum: LeaseStatus, example: 'ENDED' })
  @IsEnum(LeaseStatus)
  status: LeaseStatus;
}
