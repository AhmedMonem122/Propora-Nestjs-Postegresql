import { Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service.js';
import { RealtimeListener } from './realtime.listener.js';

@Module({
  providers: [RealtimeService, RealtimeListener],
  exports: [RealtimeService],
})
export class RealtimeModule {}
