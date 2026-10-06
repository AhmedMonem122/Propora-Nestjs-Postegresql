import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DocumentCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import { SupabaseService } from '../storage/supabase.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  UploadDocumentDto,
} from './dto/document.dto.js';

export interface DocumentListQuery {
  entityType?: string;
  entityId?: string;
  category?: DocumentCategory;
  page?: number;
  limit?: number;
}

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}

const ALLOWED_ENTITY_TYPES = [
  'property',
  'building',
  'unit',
  'resident',
  'lease',
  'payment',
  'maintenance_request',
];

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async findAll(query: DocumentListQuery) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.DocumentWhereInput = {
      organizationId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.category ? { category: query.category } : {}),
    };

    const [total, documents] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        include: { uploader: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(documents, buildPaginationMeta(total, page, limit));
  }

  async create(dto: CreateDocumentDto) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const entityType = this.assertEntityType(dto.entityType);

    await this.assertEntityInOrganization(
      entityType,
      dto.entityId,
      organizationId,
    );

    return this.prisma.document.create({
      data: {
        organizationId,
        entityType,
        entityId: dto.entityId,
        name: dto.name,
        url: dto.url,
        sizeBytes: dto.sizeBytes,
        mimeType: dto.mimeType,
        category: dto.category ?? 'OTHER',
        uploadedById: this.tenantContext.getUserId(),
      },
      include: { uploader: true },
    });
  }

  async uploadFile(
    entityType: string,
    entityId: string,
    file: UploadedFile,
    dto: UploadDocumentDto,
  ) {
    const organizationId = this.tenantContext.requireOrganizationId();
    const normalizedEntityType = this.assertEntityType(entityType);

    await this.assertEntityInOrganization(
      normalizedEntityType,
      entityId,
      organizationId,
    );

    await this.supabaseService.ensureBucket();

    const storagePath = this.buildStoragePath(
      organizationId,
      normalizedEntityType,
      entityId,
      file.originalname,
    );

    const url = await this.supabaseService.upload(
      storagePath,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.document.create({
      data: {
        organizationId,
        entityType: normalizedEntityType,
        entityId,
        name: dto.name ?? file.originalname,
        url,
        storagePath,
        sizeBytes: file.buffer.byteLength,
        mimeType: file.mimetype,
        category: dto.category ?? 'OTHER',
        uploadedById: this.tenantContext.getUserId(),
      },
      include: { uploader: true },
    });
  }

  async findOne(documentId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      include: { uploader: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async update(documentId: string, dto: UpdateDocumentDto) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        name: dto.name,
        category: dto.category,
      },
      include: { uploader: true },
    });
  }

  async replaceFile(documentId: string, file: UploadedFile) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!document.storagePath) {
      throw new BadRequestException(
        'This document was attached by URL and has no file in storage',
      );
    }

    await this.supabaseService.ensureBucket();

    const url = await this.supabaseService.upload(
      document.storagePath,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        url,
        sizeBytes: file.buffer.byteLength,
        mimeType: file.mimetype,
      },
      include: { uploader: true },
    });
  }

  async remove(documentId: string) {
    const organizationId = this.tenantContext.requireOrganizationId();

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.storagePath) {
      try {
        await this.supabaseService.delete(document.storagePath);
      } catch {
        this.logger.warn(
          `Could not delete file from Supabase for document ${documentId}`,
        );
      }
    }

    await this.prisma.document.delete({ where: { id: documentId } });

    return { id: documentId, deleted: true };
  }

  private assertEntityType(entityType: string): string {
    const normalized = entityType.toLowerCase();

    if (!ALLOWED_ENTITY_TYPES.includes(normalized)) {
      throw new BadRequestException(
        `Invalid entity type. Allowed: ${ALLOWED_ENTITY_TYPES.join(', ')}`,
      );
    }

    return normalized;
  }

  private buildStoragePath(
    organizationId: string,
    entityType: string,
    entityId: string,
    originalname: string,
  ): string {
    const sanitized = originalname
      .replace(/[^\w.-]/g, '_')
      .slice(-120);

    return `${organizationId}/${entityType}/${entityId}/${randomUUID()}-${sanitized}`;
  }

  private async assertEntityInOrganization(
    entityType: string,
    entityId: string,
    organizationId: string,
  ): Promise<void> {
    const where = { id: entityId, organizationId } as never;

    const delegates: Record<string, (where: never) => Promise<unknown>> = {
      property: (where) => this.prisma.property.findFirst({ where }),
      building: (where) => this.prisma.building.findFirst({ where }),
      unit: (where) => this.prisma.unit.findFirst({ where }),
      resident: (where) => this.prisma.resident.findFirst({ where }),
      lease: (where) => this.prisma.lease.findFirst({ where }),
      payment: (where) => this.prisma.payment.findFirst({ where }),
      maintenance_request: (where) =>
        this.prisma.maintenanceRequest.findFirst({ where }),
    };

    const entity = await delegates[entityType](where);

    if (!entity) {
      throw new NotFoundException(
        `Referenced ${entityType.replace('_', ' ')} not found`,
      );
    }
  }
}
