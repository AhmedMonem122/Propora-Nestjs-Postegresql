import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export const WEBHOOK_EVENT_CATALOG = [
  'payment.paid',
  'maintenance.assigned',
  'user.invited',
  'ping',
] as const;

export class CreateWebhookEndpointDto {
  @ApiProperty({
    description: 'HTTPS endpoint receiving signed JSON POSTs',
    example: 'https://example.com/hooks/propora',
  })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiPropertyOptional({
    description: `Subscribed events. Empty = all. Known events: ${WEBHOOK_EVENT_CATALOG.join(', ')}`,
    example: ['payment.paid'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];
}

export class UpdateWebhookEndpointDto {
  @ApiPropertyOptional({ description: 'Target URL' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @ApiPropertyOptional({ description: 'Subscribed events (empty = all)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @ApiPropertyOptional({ description: 'Disable without deleting' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
