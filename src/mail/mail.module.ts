import { Module } from '@nestjs/common';
import { MailListener } from './mail.listener.js';
import { MailService } from './mail.service.js';

@Module({
  providers: [MailService, MailListener],
  exports: [MailService],
})
export class MailModule {}
