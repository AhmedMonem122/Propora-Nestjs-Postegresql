import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { DocumentCategory } from '@prisma/client';
import { DocumentsService, type UploadedFile as UploadedFileModel } from './documents.service.js';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  UploadDocumentDto,
} from './dto/document.dto.js';

@ApiBearerAuth()
@ApiTags('documents')
@Controller('documents')
@RequirePermissions('document:read')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents (filter by attached entity)' })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiOkResponse({ description: 'Paginated documents' })
  findAll(
    @Query()
    query: PaginationQueryDto & {
      entityType?: string;
      entityId?: string;
      category?: DocumentCategory;
    },
  ) {
    return this.documentsService.findAll(query);
  }

  @Post()
  @RequirePermissions('document:create')
  @ApiOperation({ summary: 'Attach a document by URL to any entity' })
  @ApiCreatedResponse({ description: 'Created document' })
  create(@Body() dto: CreateDocumentDto) {
    return this.documentsService.create(dto);
  }

  @Post('upload')
  @RequirePermissions('document:create')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a file to Supabase storage and attach it to any entity',
  })
  @ApiCreatedResponse({ description: 'Created document' })
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@Body() dto: UploadDocumentDto, @UploadedFile() file: UploadedFileModel) {
    return this.documentsService.uploadFile(
      dto.entityType,
      dto.entityId,
      file,
      dto,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document by id' })
  @ApiOkResponse({ description: 'Document details' })
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('document:update')
  @ApiOperation({ summary: 'Update document metadata (name, category)' })
  @ApiOkResponse({ description: 'Updated document' })
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.update(id, dto);
  }

  @Post(':id/file')
  @RequirePermissions('document:update')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Replace the file in Supabase storage (overwrites the old file)',
  })
  @ApiOkResponse({ description: 'Updated document' })
  @UseInterceptors(FileInterceptor('file'))
  replaceFile(@Param('id') id: string, @UploadedFile() file: UploadedFileModel) {
    return this.documentsService.replaceFile(id, file);
  }

  @Delete(':id')
  @RequirePermissions('document:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete the document row and its file from Supabase storage',
  })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
