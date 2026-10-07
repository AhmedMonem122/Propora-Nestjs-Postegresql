import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  DocumentsService,
  type UploadedFile,
} from '../../src/documents/documents.service.js';
import type { UploadDocumentDto } from '../../src/documents/dto/document.dto.js';

function createService() {
  const prisma = {
    document: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ id: 'doc-1', ...data }),
      ),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: 'doc-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'doc-1' }),
    },
    property: {
      findFirst: vi.fn().mockResolvedValue({ id: 'property-1' }),
    },
    building: {
      findFirst: vi.fn().mockResolvedValue({ id: 'building-1' }),
    },
    unit: {
      findFirst: vi.fn().mockResolvedValue({ id: 'unit-1' }),
    },
    resident: {
      findFirst: vi.fn().mockResolvedValue({ id: 'resident-1' }),
    },
    lease: {
      findFirst: vi.fn().mockResolvedValue({ id: 'lease-1' }),
    },
    payment: {
      findFirst: vi.fn().mockResolvedValue({ id: 'payment-1' }),
    },
    maintenance_request: {
      findFirst: vi.fn().mockResolvedValue({ id: 'maintenance-1' }),
    },
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(arg)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };

  const tenantContext = {
    requireOrganizationId: vi.fn().mockReturnValue('org-1'),
    getUserId: vi.fn().mockReturnValue('user-1'),
  };

  const supabaseService = {
    ensureBucket: vi.fn().mockResolvedValue(undefined),
    upload: vi
      .fn()
      .mockImplementation((path: string) =>
        Promise.resolve(`https://supabase.storage/${path}`),
      ),
    delete: vi.fn().mockResolvedValue(undefined),
    publicUrl: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true),
  };

  const service = new DocumentsService(
    prisma as never,
    tenantContext as never,
    supabaseService as never,
  );

  return { service, prisma, tenantContext, supabaseService };
}

const file: UploadedFile = {
  originalname: 'lease-contract.pdf',
  buffer: Buffer.from('fake-pdf-bytes'),
  mimetype: 'application/pdf',
};

describe('DocumentsService', () => {
  it('uploads a file to a tenant-scoped storage path and creates the row', async () => {
    const { service, prisma, supabaseService } = createService();

    const document = await service.uploadFile(
      'lease',
      'lease-1',
      file,
      {} as UploadDocumentDto,
    );

    expect(supabaseService.ensureBucket).toHaveBeenCalled();
    expect(supabaseService.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^org-1\/lease\/lease-1\//),
      file.buffer,
      'application/pdf',
    );
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          entityType: 'lease',
          entityId: 'lease-1',
          name: 'lease-contract.pdf',
          storagePath: expect.stringMatching(/^org-1\/lease\/lease-1\//),
          url: expect.stringContaining('supabase.storage'),
          uploadedById: 'user-1',
        }),
      }),
    );
    expect(document.url).toContain('supabase.storage');
  });

  it('rejects an invalid entity type', async () => {
    const { service } = createService();

    await expect(
      service.uploadFile('invoice', 'invoice-1', file, {} as UploadDocumentDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects uploading to an entity that does not belong to the organization', async () => {
    const { service, prisma } = createService();
    prisma.property.findFirst.mockResolvedValue(null);

    await expect(
      service.uploadFile('property', 'unknown-property', file, {} as UploadDocumentDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replaces the file in storage when the document is updated with a new file', async () => {
    const { service, prisma, supabaseService } = createService();
    const existing = {
      id: 'doc-1',
      organizationId: 'org-1',
      storagePath: 'org-1/lease/lease-1/uuid-lease.pdf',
      url: 'https://supabase.storage/old',
    };

    prisma.document.findFirst.mockResolvedValue(existing);

    const updated = await service.replaceFile('doc-1', file);

    expect(supabaseService.upload).toHaveBeenCalledWith(
      'org-1/lease/lease-1/uuid-lease.pdf',
      file.buffer,
      'application/pdf',
    );
    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: expect.objectContaining({
          url: 'https://supabase.storage/org-1/lease/lease-1/uuid-lease.pdf',
          sizeBytes: file.buffer.byteLength,
          mimeType: 'application/pdf',
        }),
      }),
    );
    expect(updated.id).toBe('doc-1');
  });

  it('rejects replacing a file on a document that was attached by URL', async () => {
    const { service, prisma } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      organizationId: 'org-1',
      storagePath: null,
    });

    await expect(service.replaceFile('doc-1', file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes the file from supabase when the document row is deleted', async () => {
    const { service, prisma, supabaseService } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      organizationId: 'org-1',
      storagePath: 'org-1/lease/lease-1/uuid-lease.pdf',
    });

    await service.remove('doc-1');

    expect(supabaseService.delete).toHaveBeenCalledWith(
      'org-1/lease/lease-1/uuid-lease.pdf',
    );
    expect(prisma.document.delete).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
    });
  });

  it('skips supabase deletion for documents attached by URL', async () => {
    const { service, prisma, supabaseService } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      organizationId: 'org-1',
      storagePath: null,
    });

    await service.remove('doc-1');

    expect(supabaseService.delete).not.toHaveBeenCalled();
    expect(prisma.document.delete).toHaveBeenCalled();
  });

  it('returns 404 when deleting a document of another organization', async () => {
    const { service, prisma } = createService();
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(service.remove('doc-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates document metadata only', async () => {
    const { service, prisma } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      organizationId: 'org-1',
    });

    await service.update('doc-1', { name: 'New name.pdf' });

    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: { name: 'New name.pdf', category: undefined },
      }),
    );
  });
});
