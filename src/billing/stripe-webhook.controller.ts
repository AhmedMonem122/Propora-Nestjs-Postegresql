import { Controller, Headers, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { BillingService } from './billing.service.js';

/**
 * Stripe sends `application/json` here and signs the EXACT raw bytes.
 * A raw-body parser is registered for this path in both bootstraps
 * (src/main.ts, api/index.ts) ahead of express.json(), so `req.body`
 * is the untouched Buffer the signature was computed over.
 */
@ApiTags('billing')
@Controller('billing/stripe')
export class StripeWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook receiver (signature verified)' })
  @ApiOkResponse({ description: 'Acknowledgement' })
  handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.billing.handleStripeWebhook(
      req.body as Buffer,
      signature,
    );
  }
}
