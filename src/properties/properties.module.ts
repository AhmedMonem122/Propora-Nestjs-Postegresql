import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller.js';
import { PropertiesService } from './properties.service.js';
import { BuildingsController } from './buildings.controller.js';
import { BuildingsService } from './buildings.service.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';

@Module({
  controllers: [
    PropertiesController,
    BuildingsController,
    UnitsController,
  ],
  providers: [PropertiesService, BuildingsService, UnitsService],
})
export class PropertiesModule {}
