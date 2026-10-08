import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class CreatePlatformUserDto {
  @ApiProperty({ example: 'partner@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Sara' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Mahmoud' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName!: string;

  @ApiPropertyOptional({ example: '+201001234567' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Optional linked portal user account',
  })
  @IsString()
  @IsOptional()
  userId?: string;
}

export class UpdatePlatformUserDto {
  @ApiPropertyOptional({ example: 'partner@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Linked portal user account (null unlinks)',
  })
  @IsString()
  @IsOptional()
  userId?: string | null;
}
