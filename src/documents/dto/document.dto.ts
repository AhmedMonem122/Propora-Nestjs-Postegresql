import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentCategory } from '@prisma/client';

const ENTITY_TYPES = [
  'property',
  'building',
  'unit',
  'resident',
  'lease',
  'payment',
  'maintenance_request',
] as const;

export class CreateDocumentDto {
  @ApiProperty({ example: 'lease', enum: ENTITY_TYPES })
  @IsString()
  @MinLength(1)
  entityType: string;

  @ApiProperty({ example: 'cm4-lease-id' })
  @IsString()
  @MinLength(1)
  entityId: string;

  @ApiProperty({ example: 'Signed lease contract.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'https://cdn.propora.io/documents/abc.pdf' })
  @IsString()
  @MaxLength(2000)
  url: string;

  @ApiPropertyOptional({ example: 184320 })
  @IsOptional()
  sizeBytes?: number;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  mimeType?: string;

  @ApiPropertyOptional({ enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  @IsOptional()
  category?: DocumentCategory;
}

export class UploadDocumentDto {
  @ApiProperty({ example: 'lease', enum: ENTITY_TYPES })
  @IsString()
  @MinLength(1)
  entityType: string;

  @ApiProperty({ example: 'cm4-lease-id' })
  @IsString()
  @MinLength(1)
  entityId: string;

  @ApiPropertyOptional({ example: 'Signed lease contract.pdf' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  @IsOptional()
  category?: DocumentCategory;
}

export class UpdateDocumentDto {
  @ApiPropertyOptional({ example: 'Renamed contract.pdf' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  @IsOptional()
  category?: DocumentCategory;
}
