import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DocumentCategory } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class DocumentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Entity type the document is attached to',
    example: 'lease',
  })
  @IsString()
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional({ description: 'Attached entity id' })
  @IsString()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({ enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  @IsOptional()
  category?: DocumentCategory;

  @ApiPropertyOptional({ description: 'Search by file name' })
  @IsString()
  @IsOptional()
  search?: string;
}
