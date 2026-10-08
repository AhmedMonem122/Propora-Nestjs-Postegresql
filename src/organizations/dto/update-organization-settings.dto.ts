import {
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOrganizationSettingsDto {
  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsUrl({ require_tld: false })
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'Africa/Cairo' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ example: 'EGP' })
  @IsString()
  @Length(3, 3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsString()
  @Length(2, 5)
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ example: 'EG-123-456-789' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  taxNumber?: string;
}
