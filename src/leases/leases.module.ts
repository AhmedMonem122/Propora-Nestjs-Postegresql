import { Module } from '@nestjs/common';
import { LeasesController } from './leases.controller.js';
import { LeasesService } from './leases.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [BillingModule],
  controllers: [LeasesController, PaymentsController],
  providers: [LeasesService, PaymentsService],
})
export class LeasesModule {}
