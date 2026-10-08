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
import { BuildingsService } from './buildings.service.js';
import { CreateBuildingDto, UpdateBuildingDto } from './dto/building.dto.js';

@ApiBearerAuth()
@ApiTags('properties')
@Controller()
@AuditEntity('building')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get('properties/:propertyId/buildings')
  @RequirePermissions('building:read')
  @ApiOperation({ summary: 'List buildings of a property' })
  @ApiOkResponse({ description: 'Buildings' })
  findAllByProperty(@Param('propertyId') propertyId: string) {
    return this.buildingsService.findAllByProperty(propertyId);
  }

  @Post('properties/:propertyId/buildings')
  @RequirePermissions('building:create')
  @ApiOperation({ summary: 'Create a building inside a property' })
  @ApiCreatedResponse({ description: 'Created building' })
  create(
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateBuildingDto,
  ) {
    return this.buildingsService.create(propertyId, dto);
  }

  @Get('buildings/:id')
  @RequirePermissions('building:read')
  @ApiOperation({ summary: 'Get a building with its units' })
  @ApiOkResponse({ description: 'Building details' })
  findOne(@Param('id') id: string) {
    return this.buildingsService.findOne(id);
  }

  @Patch('buildings/:id')
  @RequirePermissions('building:update')
  @ApiOperation({ summary: 'Update a building' })
  @ApiOkResponse({ description: 'Updated building' })
  update(@Param('id') id: string, @Body() dto: UpdateBuildingDto) {
    return this.buildingsService.update(id, dto);
  }

  @Delete('buildings/:id')
  @RequirePermissions('building:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a building (cascades to its units)' })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.buildingsService.remove(id);
  }
}
