import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { MaintenanceService } from './maintenance.service.js';
import {
  AssignMaintenanceDto,
  CloseMaintenanceDto,
  CreateMaintenanceRequestDto,
  MaintenanceStatusDto,
  UpdateMaintenanceRequestDto,
} from './dto/maintenance.dto.js';

@ApiBearerAuth()
@ApiTags('maintenance')
@Controller('maintenance')
@RequirePermissions('maintenance:read')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('requests')
  @ApiOperation({ summary: 'List maintenance requests (filterable)' })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] })
  @ApiQuery({ name: 'priority', required: false, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiOkResponse({ description: 'Paginated maintenance requests' })
  findAll(
    @Query()
    query: PaginationQueryDto & {
      status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      unitId?: string;
      assignedToId?: string;
      search?: string;
    },
  ) {
    return this.maintenanceService.findAll(query);
  }

  @Post('requests')
  @RequirePermissions('maintenance:create')
  @ApiOperation({ summary: 'Create a maintenance request' })
  @ApiCreatedResponse({ description: 'Created maintenance request' })
  create(@Body() dto: CreateMaintenanceRequestDto) {
    return this.maintenanceService.create(dto);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Get a maintenance request' })
  @ApiOkResponse({ description: 'Maintenance request details' })
  findOne(@Param('id') id: string) {
    return this.maintenanceService.findOne(id);
  }

  @Patch('requests/:id')
  @RequirePermissions('maintenance:update')
  @ApiOperation({ summary: 'Update a maintenance request' })
  @ApiOkResponse({ description: 'Updated maintenance request' })
  update(@Param('id') id: string, @Body() dto: UpdateMaintenanceRequestDto) {
    return this.maintenanceService.update(id, dto);
  }

  @Post('requests/:id/assign')
  @RequirePermissions('maintenance:assign')
  @ApiOperation({ summary: 'Assign a technician and optionally schedule the visit' })
  @ApiOkResponse({ description: 'Assigned maintenance request' })
  assign(@Param('id') id: string, @Body() dto: AssignMaintenanceDto) {
    return this.maintenanceService.assign(id, dto);
  }

  @Patch('requests/:id/status')
  @RequirePermissions('maintenance:update')
  @ApiOperation({ summary: 'Change maintenance request status' })
  @ApiOkResponse({ description: 'Updated maintenance request' })
  updateStatus(@Param('id') id: string, @Body() dto: MaintenanceStatusDto) {
    return this.maintenanceService.updateStatus(id, dto);
  }

  @Post('requests/:id/resolve')
  @RequirePermissions('maintenance:update')
  @ApiOperation({ summary: 'Resolve a request with cost and notes' })
  @ApiOkResponse({ description: 'Resolved maintenance request' })
  resolve(@Param('id') id: string, @Body() dto: CloseMaintenanceDto) {
    return this.maintenanceService.closeWithDetails(id, dto);
  }

  @Delete('requests/:id')
  @RequirePermissions('maintenance:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a maintenance request' })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.maintenanceService.remove(id);
  }
}
