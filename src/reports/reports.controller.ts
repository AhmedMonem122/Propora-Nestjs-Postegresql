import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { ReportsService } from './reports.service.js';

@ApiBearerAuth()
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('financial')
  @RequirePermissions('report:financial')
  @ApiOperation({ summary: 'Financial summary: expected rent, collections, outstanding, overdue' })
  financial() {
    return this.reportsService.financial();
  }

  @Get('occupancy')
  @RequirePermissions('report:occupancy')
  @ApiOperation({ summary: 'Occupancy report per property' })
  occupancy() {
    return this.reportsService.occupancy();
  }
}
