import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { PlatformService } from './platform.service.js';
import { UpdatePlatformOrganizationDto } from './dto/update-platform-organization.dto.js';

@ApiBearerAuth()
@ApiTags('platform')
@Controller('platform')
@RequirePermissions('platform:manage')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('organizations')
  @ApiOperation({ summary: 'List all organizations on the platform' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'SUSPENDED'] })
  @ApiQuery({ name: 'search', required: false })
  @ApiOkResponse({ description: 'Paginated organizations' })
  listOrganizations(
    @Query()
    query: PaginationQueryDto & {
      status?: 'ACTIVE' | 'SUSPENDED';
      search?: string;
    },
  ) {
    return this.platformService.listOrganizations(query);
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Get organization details' })
  @ApiOkResponse({ description: 'Organization details' })
  getOrganization(@Param('id') id: string) {
    return this.platformService.getOrganization(id);
  }

  @Patch('organizations/:id')
  @ApiOperation({ summary: 'Suspend or reactivate an organization' })
  @ApiOkResponse({ description: 'Updated organization' })
  updateOrganizationStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformOrganizationDto,
  ) {
    return this.platformService.updateOrganizationStatus(id, dto.status);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform-level usage statistics' })
  @ApiOkResponse({ description: 'Platform statistics' })
  getStats() {
    return this.platformService.getStats();
  }
}
