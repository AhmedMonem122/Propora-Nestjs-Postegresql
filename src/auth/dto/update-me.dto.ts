import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Ahmed' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Monem' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ example: '+201001234567' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string;
}
