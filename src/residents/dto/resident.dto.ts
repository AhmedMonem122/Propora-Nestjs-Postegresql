import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResidentStatus } from '@prisma/client';
import { IsPhoneNumber } from '../../common/validators/phone.validator.js';
import { IsEgyptianNationalId } from '../../common/validators/national-id.validator.js';

export class CreateResidentDto {
  @ApiPropertyOptional({
    description: 'Linked portal user account (must belong to the organization)',
  })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @ApiProperty({ example: 'Monem' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName: string;

  @ApiPropertyOptional({ example: 'ahmed@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+201001234567' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiPropertyOptional({ example: '29901011234567' })
  @IsString()
  @MaxLength(14)
  @IsOptional()
  @IsEgyptianNationalId()
  idNumber?: string;

  @ApiPropertyOptional({ enum: ResidentStatus })
  @IsEnum(ResidentStatus)
  @IsOptional()
  status?: ResidentStatus;

  @ApiPropertyOptional({ example: 'Sara Monem - +201009876543' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  emergencyContact?: string;

  @ApiPropertyOptional({ example: 'Prefers email communication' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class UpdateResidentDto {
  @ApiPropertyOptional({
    description: 'Linked portal user account (must belong to the organization)',
  })
  @IsString()
  @IsOptional()
  userId?: string | null;

  @ApiPropertyOptional({ example: 'Ahmed' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Monem' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ example: 'ahmed@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+201001234567' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiPropertyOptional({ example: '29901011234567' })
  @IsString()
  @MaxLength(14)
  @IsOptional()
  @IsEgyptianNationalId()
  idNumber?: string;

  @ApiPropertyOptional({ enum: ResidentStatus })
  @IsEnum(ResidentStatus)
  @IsOptional()
  status?: ResidentStatus;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  emergencyContact?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
