import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrganizationStatus } from '@prisma/client';

export class UpdatePlatformOrganizationDto {
  @ApiProperty({ enum: OrganizationStatus, example: 'SUSPENDED' })
  @IsEnum(OrganizationStatus)
  @IsNotEmpty()
  status: OrganizationStatus;
}
