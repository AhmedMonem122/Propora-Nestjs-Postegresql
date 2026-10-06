import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'Fallback when the httpOnly refresh cookie is not available (e.g. mobile clients)',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
