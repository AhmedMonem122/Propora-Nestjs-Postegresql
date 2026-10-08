import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUnitTypeDto {
  @ApiProperty({ example: '2BR' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ example: 'Two bedroom unit' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;
}

export class UpdateUnitTypeDto {
  @ApiPropertyOptional({ example: '2BR' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Two bedroom unit' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;
}
