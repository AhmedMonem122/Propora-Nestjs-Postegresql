import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationStatus, SubscriptionStatus } from '@prisma/client';

export class UpdatePlatformOrganizationDto {
  @ApiPropertyOptional({ enum: OrganizationStatus, example: 'SUSPENDED' })
  @IsEnum(OrganizationStatus)
  @IsOptional()
  status?: OrganizationStatus;

  @ApiPropertyOptional({ example: 'PRO', description: 'Billing plan name' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  plan?: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  subscriptionStatus?: SubscriptionStatus;

  @ApiPropertyOptional({
    description: 'Assign a platform user as organization manager (null unassigns)',
  })
  @IsString()
  @IsOptional()
  platformManagerId?: string | null;
}
