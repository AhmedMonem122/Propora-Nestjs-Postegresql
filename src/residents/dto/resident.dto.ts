import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateResidentDto {
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
  phone?: string;

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
  phone?: string;

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
