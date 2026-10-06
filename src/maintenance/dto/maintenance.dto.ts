import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MaintenancePriority,
  MaintenanceStatus,
} from '@prisma/client';

export class CreateMaintenanceRequestDto {
  @ApiProperty({ example: 'cm4x-unit-id' })
  @IsString()
  @MinLength(1)
  unitId: string;

  @ApiPropertyOptional({ example: 'cm4y-resident-id' })
  @IsString()
  @IsOptional()
  residentId?: string;

  @ApiProperty({ example: 'Air conditioner not cooling' })
  @IsString()
  @MinLength(3)
  title: string;

  @ApiPropertyOptional({ example: 'AC blows warm air since yesterday' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsEnum(MaintenancePriority)
  @IsOptional()
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ example: 'Urgent - tenant is elderly' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class UpdateMaintenanceRequestDto {
  @ApiPropertyOptional({ example: 'AC not cooling - unit 101' })
  @IsString()
  @IsOptional()
  @MinLength(3)
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsEnum(MaintenancePriority)
  @IsOptional()
  priority?: MaintenancePriority;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class AssignMaintenanceDto {
  @ApiProperty({ example: 'cm4z-technician-user-id' })
  @IsString()
  @MinLength(1)
  assignedToId: string;

  @ApiPropertyOptional({ example: '2026-10-08T10:00:00Z' })
  @IsDateString()
  @Type(() => Date)
  @IsOptional()
  scheduledAt?: Date;
}

export class MaintenanceStatusDto {
  @ApiProperty({ enum: MaintenanceStatus, example: 'IN_PROGRESS' })
  @IsEnum(MaintenanceStatus)
  status: MaintenanceStatus;
}

export class CloseMaintenanceDto {
  @ApiProperty({ example: 350 })
  @IsNumber()
  @IsOptional()
  cost?: number;

  @ApiPropertyOptional({ example: 'Replaced compressor' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
