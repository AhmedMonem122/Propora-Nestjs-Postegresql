import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { PlatformAuthController } from './platform-auth.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';

@Module({
  imports: [AuthModule, AuditModule, RbacModule],
  controllers: [PlatformController, PlatformAuthController],
  providers: [PlatformService],
})
export class PlatformModule {}
