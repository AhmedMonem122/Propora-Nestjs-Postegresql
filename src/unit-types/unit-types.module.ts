import { Module } from '@nestjs/common';
import { UnitTypesController } from './unit-types.controller.js';
import { UnitTypesService } from './unit-types.service.js';

@Module({
  controllers: [UnitTypesController],
  providers: [UnitTypesService],
})
export class UnitTypesModule {}
