import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { RbacService } from './rbac.service.js';

@Module({
  controllers: [RolesController],
  providers: [RolesService, RbacService],
  exports: [RbacService],
})
export class RbacModule {}
