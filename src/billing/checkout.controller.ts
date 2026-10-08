import { Controller, Get, Param, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { Audit } from '../audit/audit.decorator.js';
import { BillingService } from './billing.service.js';
import { InvoicesService } from './invoices.service.js';

@ApiTags('billing')
@Controller()
export class CheckoutController {
  constructor(
    private readonly billing: BillingService,
    private readonly invoices: InvoicesService,
  ) {}

  @Post('payments/:id/checkout')
  @RequirePermissions('payment:create')
  @Audit('payment.checkout', { entity: 'payment' })
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create an online checkout session (Stripe, or Fake when unconfigured)',
  })
  @ApiOkResponse({ description: 'Checkout session with redirect URL' })
  createCheckout(@Param('id') id: string) {
    return this.billing.createCheckout(id);
  }

  @Get('payments/:id/invoice')
  @RequirePermissions('payment:read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download the payment invoice as PDF' })
  @ApiOkResponse({ description: 'PDF invoice' })
  async downloadInvoice(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, invoiceNo } =
      await this.invoices.generateForPayment(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="Invoice-${invoiceNo}.pdf"`,
    });
    res.send(buffer);
  }

  @Public()
  @Get('billing/fake/:ref/confirm')
  @ApiOperation({
    summary: 'Confirm a Fake-provider checkout (offline testing link)',
  })
  @ApiOkResponse({ description: 'Paid payment' })
  confirmFake(@Param('ref') ref: string) {
    return this.billing.confirmFakeSession(ref);
  }
}
