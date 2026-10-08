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
import { AuditEntity } from '../audit/audit.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { LeasesService } from './leases.service.js';
import {
  CreateLeaseDto,
  LeaseStatusDto,
  UpdateLeaseDto,
} from './dto/lease.dto.js';

@ApiBearerAuth()
@ApiTags('leases')
@Controller('leases')
@RequirePermissions('lease:read')
@AuditEntity('lease')
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Get()
  @ApiOperation({ summary: 'List leases (paginated, filterable)' })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'residentId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['UPCOMING', 'ACTIVE', 'ENDED', 'TERMINATED'] })
  @ApiOkResponse({ description: 'Paginated leases' })
  findAll(
    @Query()
    query: PaginationQueryDto & {
      unitId?: string;
      residentId?: string;
      status?: 'UPCOMING' | 'ACTIVE' | 'ENDED' | 'TERMINATED';
    },
  ) {
    return this.leasesService.findAll(query);
  }

  @Post()
  @RequirePermissions('lease:create')
  @ApiOperation({ summary: 'Create a lease (validates unit, resident and date overlaps)' })
  @ApiCreatedResponse({ description: 'Created lease' })
  create(@Body() dto: CreateLeaseDto) {
    return this.leasesService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lease with its payments' })
  @ApiOkResponse({ description: 'Lease details' })
  findOne(@Param('id') id: string) {
    return this.leasesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('lease:update')
  @ApiOperation({ summary: 'Update a lease' })
  @ApiOkResponse({ description: 'Updated lease' })
  update(@Param('id') id: string, @Body() dto: UpdateLeaseDto) {
    return this.leasesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('lease:update')
  @ApiOperation({ summary: 'Change lease status (e.g. end or terminate)' })
  @ApiOkResponse({ description: 'Updated lease' })
  updateStatus(@Param('id') id: string, @Body() dto: LeaseStatusDto) {
    return this.leasesService.updateStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('lease:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a lease' })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.leasesService.remove(id);
  }
}
