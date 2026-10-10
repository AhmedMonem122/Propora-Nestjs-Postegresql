import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteOrganizationDto {
  @ApiProperty({
    example: 'acme-properties',
    description:
      'Type the organization slug to confirm permanent deletion (danger zone)',
  })
  @IsString()
  @MinLength(1)
  confirm!: string;
}
