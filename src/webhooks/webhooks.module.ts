import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhookListener } from './webhook.listener.js';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookListener],
  exports: [WebhooksService],
})
export class WebhooksModule {}
