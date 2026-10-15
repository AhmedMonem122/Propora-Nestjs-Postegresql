import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationStatus, SubscriptionStatus } from '@prisma/client';
import { ORGANIZATION_PLANS } from '../../common/constants/organization.constants.js';

export class UpdatePlatformOrganizationDto {
  @ApiPropertyOptional({ enum: OrganizationStatus, example: 'SUSPENDED' })
  @IsEnum(OrganizationStatus)
  @IsOptional()
  status?: OrganizationStatus;

  @ApiPropertyOptional({
    enum: ORGANIZATION_PLANS,
    example: 'GROWTH',
    description: 'Billing plan name (closed list — rendered as a dropdown)',
  })
  @IsIn(ORGANIZATION_PLANS)
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
