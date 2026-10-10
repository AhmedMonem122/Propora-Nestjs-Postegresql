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
import { UnitQueryDto } from './dto/unit-query.dto.js';
import { UnitsService } from './units.service.js';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto.js';

@ApiBearerAuth()
@ApiTags('properties')
@Controller()
@AuditEntity('unit')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get('buildings/:buildingId/units')
  @RequirePermissions('unit:read')
  @ApiOperation({ summary: 'List units of a building' })
  @ApiOkResponse({ description: 'Paginated units' })
  findAllByBuilding(
    @Param('buildingId') buildingId: string,
    @Query() query: UnitQueryDto,
  ) {
    return this.unitsService.findAllByBuilding(buildingId, query);
  }

  @Get('properties/:propertyId/units')
  @RequirePermissions('unit:read')
  @ApiOperation({ summary: 'List all units of a property' })
  @ApiOkResponse({ description: 'Paginated units' })
  findAllByProperty(
    @Param('propertyId') propertyId: string,
    @Query() query: UnitQueryDto,
  ) {
    return this.unitsService.findAllByProperty(propertyId, query);
  }

  @Post('buildings/:buildingId/units')
  @RequirePermissions('unit:create')
  @ApiOperation({ summary: 'Create a unit inside a building' })
  @ApiCreatedResponse({ description: 'Created unit' })
  create(
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateUnitDto,
  ) {
    return this.unitsService.create(buildingId, dto);
  }

  @Get('units/:id')
  @RequirePermissions('unit:read')
  @ApiOperation({ summary: 'Get a unit with its building, property and lease history' })
  @ApiOkResponse({ description: 'Unit details' })
  findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }

  @Patch('units/:id')
  @RequirePermissions('unit:update')
  @ApiOperation({ summary: 'Update a unit' })
  @ApiOkResponse({ description: 'Updated unit' })
  update(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.unitsService.update(id, dto);
  }

  @Delete('units/:id')
  @RequirePermissions('unit:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a unit' })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.unitsService.remove(id);
  }
}
