import {
  Body,
  Controller,
  Get,
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
import { UserStatus } from '@prisma/client';
import { OrganizationsService } from './organizations.service.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';

@ApiBearerAuth()
@ApiTags('organizations')
@Controller('organizations')
@RequirePermissions('organization:read')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current organization profile' })
  @ApiOkResponse({ description: 'Organization profile' })
  getOwn() {
    return this.organizationsService.getOwn();
  }

  @Patch('me')
  @RequirePermissions('organization:update')
  @ApiOperation({ summary: 'Update the organization profile' })
  @ApiOkResponse({ description: 'Updated organization' })
  updateOwn(@Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.updateOwn(dto);
  }

  @Get('me/members')
  @RequirePermissions('user:read')
  @ApiOperation({ summary: 'List organization members' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listMembers(
    @Query() query: PaginationQueryDto & {
      search?: string;
      status?: UserStatus;
    },
  ) {
    return this.organizationsService.listMembers(query);
  }
}
