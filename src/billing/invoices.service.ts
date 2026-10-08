import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../database/prisma.service.js';
import { SupabaseService } from '../storage/supabase.service.js';

interface InvoiceData {
  organizationName: string;
  currency: string;
  taxNumber: string | null;
  invoiceNo: string;
  issuedAt: Date;
  dueDate: Date;
  paidAt: Date | null;
  residentName: string;
  residentEmail: string | null;
  propertyLabel: string;
  leasePeriod: string;
  description: string;
  amount: number;
  method: string;
  transactionId: string | null;
}

/**
 * Renders a payment invoice to PDF (pdfkit, no native deps — serverless
 * safe), stores it in Supabase storage and links it as a `Document` row so
 * invoices behave like every other file in the system (download, replace,
 * delete with storage cleanup).
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  invoiceNumberFor(paymentId: string): string {
    return `INV-${new Date().getFullYear()}-${paymentId.slice(-6).toUpperCase()}`;
  }

  async generateForPayment(paymentId: string): Promise<{
    buffer: Buffer;
    url: string | null;
    documentId: string | null;
    invoiceNo: string;
  }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        lease: {
          include: {
            resident: true,
            unit: { include: { building: { include: { property: true } } } },
          },
        },
        organization: { include: { settings: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    let invoiceNo = payment.invoiceNo;
    if (!invoiceNo) {
      invoiceNo = this.invoiceNumberFor(payment.id);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { invoiceNo },
      });
    }

    const amount = Number(payment.amount.toString());
    const buffer = await this.renderPdf({
      organizationName: payment.organization.name,
      currency: payment.organization.settings?.currency ?? payment.currency,
      taxNumber: payment.organization.settings?.taxNumber ?? null,
      invoiceNo,
      issuedAt: new Date(),
      dueDate: payment.dueDate,
      paidAt: payment.paidAt,
      residentName:
        `${payment.lease.resident.firstName} ${payment.lease.resident.lastName}`.trim(),
      residentEmail: payment.lease.resident.email,
      propertyLabel: `${payment.lease.unit.building.property.name} / ${payment.lease.unit.name}`,
      leasePeriod: `${payment.lease.startDate.toISOString().slice(0, 10)} → ${payment.lease.endDate ? payment.lease.endDate.toISOString().slice(0, 10) : 'open-ended'}`,
      description: `${payment.type} payment — lease ${payment.lease.id.slice(-6).toUpperCase()}`,
      amount,
      method: payment.method,
      transactionId: payment.transactionId,
    });

    const storagePath = `invoices/${payment.organizationId}/${payment.id}.pdf`;
    const fileName = `Invoice-${invoiceNo}.pdf`;
    let url: string | null = null;
    let documentId: string | null = null;

    if (this.supabase.isConfigured()) {
      try {
        await this.supabase.ensureBucket();
        url = await this.supabase.upload(
          storagePath,
          buffer,
          'application/pdf',
        );

        const existing = await this.prisma.document.findFirst({
          where: {
            organizationId: payment.organizationId,
            storagePath,
          },
        });
        const row = existing
          ? await this.prisma.document.update({
              where: { id: existing.id },
              data: {
                name: fileName,
                url,
                sizeBytes: buffer.length,
                mimeType: 'application/pdf',
              },
            })
          : await this.prisma.document.create({
              data: {
                organizationId: payment.organizationId,
                entityType: 'payment',
                entityId: payment.id,
                name: fileName,
                url,
                storagePath,
                sizeBytes: buffer.length,
                mimeType: 'application/pdf',
                category: 'FINANCIAL',
              },
            });
        documentId = row.id;
      } catch (error) {
        this.logger.warn(
          `Invoice storage upload skipped: ${(error as Error)?.message}`,
        );
      }
    }

    return { buffer, url, documentId, invoiceNo };
  }

  private renderPdf(data: InvoiceData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const money = (value: number) =>
        `${value.toFixed(2)} ${data.currency}`;
      const date = (value: Date | null) =>
        value ? value.toISOString().slice(0, 10) : '—';

      // Header
      doc.fontSize(22).fillColor('#111827').text(data.organizationName);
      if (data.taxNumber) {
        doc.fontSize(9).fillColor('#6b7280').text(`Tax No: ${data.taxNumber}`);
      }
      doc.moveDown(0.5);
      doc.fontSize(28).fillColor('#1d4ed8').text('INVOICE');
      doc.fontSize(11).fillColor('#111827').text(`Invoice No: ${data.invoiceNo}`);
      doc.moveDown(1);

      // Meta table
      const meta: Array<[string, string]> = [
        ['Issued', date(data.issuedAt)],
        ['Due date', date(data.dueDate)],
        ['Paid at', date(data.paidAt)],
        ['Status', data.paidAt ? 'PAID' : 'PENDING'],
      ];
      for (const [label, value] of meta) {
        doc.fontSize(10).fillColor('#6b7280').text(label, { continued: true });
        doc.fillColor('#111827').text(`  ${value}`);
      }
      doc.moveDown(1);

      // Bill to
      doc.fontSize(12).fillColor('#111827').text('Bill to');
      doc.fontSize(10).fillColor('#374151').text(data.residentName);
      if (data.residentEmail) {
        doc.text(data.residentEmail);
      }
      doc.text(data.propertyLabel);
      doc.text(`Lease period: ${data.leasePeriod}`);
      doc.moveDown(1);

      // Line items
      doc.fontSize(12).fillColor('#111827').text('Details');
      doc.moveDown(0.25);
      const line: Array<[string, string]> = [
        [data.description, money(data.amount)],
        [`Payment method: ${data.method}`, ''],
      ];
      if (data.transactionId) {
        line.push([`Transaction: ${data.transactionId}`, '']);
      }
      for (const [label, value] of line) {
        doc.fontSize(10).fillColor('#374151').text(label, { continued: true });
        if (value) {
          doc.fillColor('#111827').text(`  ${value}`, { align: 'right' });
        } else {
          doc.text('');
        }
      }
      doc.moveDown(0.5);
      doc
        .fontSize(14)
        .fillColor('#111827')
        .text(`Total due: ${money(data.amount)}`, { align: 'right' });

      // Footer
      doc.moveDown(2);
      doc
        .fontSize(9)
        .fillColor('#9ca3af')
        .text('Generated by Propora — Property Management SaaS', {
          align: 'center',
        });

      doc.end();
    });
  }
}
