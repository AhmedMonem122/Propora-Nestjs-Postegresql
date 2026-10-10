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
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { AuditEntity } from '../audit/audit.decorator.js';
import { PropertyQueryDto } from './dto/property-query.dto.js';
import { PropertiesService } from './properties.service.js';
import {
  CreatePropertyDto,
  UpdatePropertyDto,
} from './dto/property.dto.js';

@ApiBearerAuth()
@ApiTags('properties')
@Controller('properties')
@RequirePermissions('property:read')
@AuditEntity('property')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'List properties (paginated, filterable)' })
  @ApiOkResponse({ description: 'Paginated properties' })
  findAll(@Query() query: PropertyQueryDto) {
    return this.propertiesService.findAll(query);
  }

  @Post()
  @RequirePermissions('property:create')
  @ApiOperation({ summary: 'Create a property' })
  @ApiCreatedResponse({ description: 'Created property' })
  create(@Body() dto: CreatePropertyDto) {
    return this.propertiesService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a property with its buildings' })
  @ApiOkResponse({ description: 'Property details' })
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('property:update')
  @ApiOperation({ summary: 'Update a property' })
  @ApiOkResponse({ description: 'Updated property' })
  update(@Param('id') id: string, @Body() dto: UpdatePropertyDto) {
    return this.propertiesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('property:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a property (cascades to buildings and units)' })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.propertiesService.remove(id);
  }
}
