import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRolesDto {
  @ApiProperty({ type: [String], example: ['cm4x...', 'cm4y...'] })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  roleIds: string[];
}
