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
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { AuditEntity } from '../audit/audit.decorator.js';
import { UserQueryDto } from '../users/dto/user-query.dto.js';
import { OrganizationsService } from './organizations.service.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto.js';

@ApiBearerAuth()
@ApiTags('organizations')
@Controller('organizations')
@RequirePermissions('organization:read')
@AuditEntity('organization')
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

  @Get('me/settings')
  @ApiOperation({ summary: 'Get localization and billing settings' })
  @ApiOkResponse({ description: 'Organization settings' })
  getSettings() {
    return this.organizationsService.getSettings();
  }

  @Patch('me/settings')
  @RequirePermissions('organization:update')
  @ApiOperation({ summary: 'Update localization and billing settings' })
  @ApiOkResponse({ description: 'Updated settings' })
  updateSettings(@Body() dto: UpdateOrganizationSettingsDto) {
    return this.organizationsService.updateSettings(dto);
  }

  @Get('me/members')
  @RequirePermissions('user:read')
  @ApiOperation({ summary: 'List organization members' })
  listMembers(@Query() query: UserQueryDto) {
    return this.organizationsService.listMembers(query);
  }
}
