import {
  BadRequestException,
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
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { AuditEntity } from '../audit/audit.decorator.js';
import { DocumentQueryDto } from './dto/document-query.dto.js';
import { DocumentsService, type UploadedFile as UploadedFileModel } from './documents.service.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

const uploadOptions = {
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      callback(
        new BadRequestException(
          `File type "${file.mimetype}" is not allowed`,
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  UploadDocumentDto,
} from './dto/document.dto.js';

@ApiBearerAuth()
@ApiTags('documents')
@Controller('documents')
@RequirePermissions('document:read')
@AuditEntity('document')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents (filter by attached entity)' })
  @ApiOkResponse({ description: 'Paginated documents' })
  findAll(@Query() query: DocumentQueryDto) {
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
  @UseInterceptors(FileInterceptor('file', uploadOptions))
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
  @UseInterceptors(FileInterceptor('file', uploadOptions))
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
