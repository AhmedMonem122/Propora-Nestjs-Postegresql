import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { PlatformAuthController } from './platform-auth.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [PlatformController, PlatformAuthController],
  providers: [PlatformService],
})
export class PlatformModule {}
