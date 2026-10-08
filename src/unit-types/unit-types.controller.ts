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
import { UnitTypesService } from './unit-types.service.js';
import {
  CreateUnitTypeDto,
  UpdateUnitTypeDto,
} from './dto/unit-type.dto.js';

@ApiBearerAuth()
@ApiTags('unit-types')
@Controller('unit-types')
export class UnitTypesController {
  constructor(private readonly unitTypesService: UnitTypesService) {}

  @Get()
  @RequirePermissions('unit:read')
  @ApiOperation({ summary: 'List the global unit-type catalog' })
  @ApiOkResponse({ description: 'Unit types' })
  findAll() {
    return this.unitTypesService.findAll();
  }

  @Post()
  @RequirePermissions('platform:manage')
  @ApiOperation({ summary: 'Add a unit type (platform only)' })
  @ApiCreatedResponse({ description: 'Created unit type' })
  create(@Body() dto: CreateUnitTypeDto) {
    return this.unitTypesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('platform:manage')
  @ApiOperation({ summary: 'Update a unit type (platform only)' })
  @ApiOkResponse({ description: 'Updated unit type' })
  update(@Param('id') id: string, @Body() dto: UpdateUnitTypeDto) {
    return this.unitTypesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('platform:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a unit type (platform only, units are detached)',
  })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.unitTypesService.remove(id);
  }
}
