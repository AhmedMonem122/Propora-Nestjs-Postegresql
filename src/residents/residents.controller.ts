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
import { ResidentsService } from './residents.service.js';
import { CreateResidentDto, UpdateResidentDto } from './dto/resident.dto.js';

@ApiBearerAuth()
@ApiTags('residents')
@Controller('residents')
@RequirePermissions('resident:read')
@AuditEntity('resident')
export class ResidentsController {
  constructor(private readonly residentsService: ResidentsService) {}

  @Get()
  @ApiOperation({ summary: 'List residents (paginated, searchable)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiOkResponse({ description: 'Paginated residents' })
  findAll(
    @Query() query: PaginationQueryDto & { search?: string },
  ) {
    return this.residentsService.findAll(query);
  }

  @Post()
  @RequirePermissions('resident:create')
  @ApiOperation({ summary: 'Create a resident' })
  @ApiCreatedResponse({ description: 'Created resident' })
  create(@Body() dto: CreateResidentDto) {
    return this.residentsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a resident with lease history' })
  @ApiOkResponse({ description: 'Resident details' })
  findOne(@Param('id') id: string) {
    return this.residentsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('resident:update')
  @ApiOperation({ summary: 'Update a resident' })
  @ApiOkResponse({ description: 'Updated resident' })
  update(@Param('id') id: string, @Body() dto: UpdateResidentDto) {
    return this.residentsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('resident:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a resident' })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.residentsService.remove(id);
  }
}
