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
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.interface.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { PlatformService } from './platform.service.js';
import { UpdatePlatformOrganizationDto } from './dto/update-platform-organization.dto.js';
import {
  CreatePlatformUserDto,
  UpdatePlatformUserDto,
} from './dto/platform-user.dto.js';
import {
  AdminUserQueryDto,
  CreateManagedUserDto,
  UpdateManagedUserDto,
} from './dto/platform-manage-user.dto.js';
import { PlatformOrganizationQueryDto } from './dto/platform-organization-query.dto.js';

@ApiBearerAuth()
@ApiTags('platform')
@Controller('platform')
@RequirePermissions('platform:manage')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('organizations')
  @ApiOperation({ summary: 'List all organizations on the platform' })
  @ApiOkResponse({ description: 'Paginated organizations' })
  listOrganizations(@Query() query: PlatformOrganizationQueryDto) {
    return this.platformService.listOrganizations(query);
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Get organization details' })
  @ApiOkResponse({ description: 'Organization details' })
  getOrganization(@Param('id') id: string) {
    return this.platformService.getOrganization(id);
  }

  @Patch('organizations/:id')
  @ApiOperation({ summary: 'Manage an organization (status, plan, subscription)' })
  @ApiOkResponse({ description: 'Updated organization' })
  updateOrganizationStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformOrganizationDto,
  ) {
    return this.platformService.updateOrganization(id, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform-level usage statistics' })
  @ApiOkResponse({ description: 'Platform statistics' })
  getStats() {
    return this.platformService.getStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'List platform users (organization managers)' })
  @ApiOkResponse({ description: 'Paginated platform users' })
  listPlatformUsers(@Query() query: PaginationQueryDto) {
    return this.platformService.listPlatformUsers(query);
  }

  @Post('users')
  @ApiOperation({ summary: 'Register a platform user' })
  @ApiCreatedResponse({ description: 'Created platform user' })
  createPlatformUser(
    @CurrentUser() caller: AuthenticatedUser,
    @Body() dto: CreatePlatformUserDto,
  ) {
    return this.platformService.createPlatformUser(
      caller.platformAdminId ?? null,
      dto,
    );
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update a platform user' })
  @ApiOkResponse({ description: 'Updated platform user' })
  updatePlatformUser(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserDto,
  ) {
    return this.platformService.updatePlatformUser(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a platform user (managed organizations are detached)',
  })
  @ApiOkResponse({ description: 'Deletion result' })
  removePlatformUser(@Param('id') id: string) {
    return this.platformService.removePlatformUser(id);
  }

  @Get('managed-users')
  @ApiOperation({
    summary: 'List every member account on the platform (admin dashboard)',
  })
  @ApiOkResponse({ description: 'Paginated users with organization and roles' })
  listAllUsers(@Query() query: AdminUserQueryDto) {
    return this.platformService.listAllUsers(query);
  }

  @Post('managed-users')
  @ApiOperation({ summary: 'Create a member inside any organization' })
  @ApiCreatedResponse({ description: 'Created member' })
  createManagedUser(@Body() dto: CreateManagedUserDto) {
    return this.platformService.createManagedUser(dto);
  }

  @Get('managed-users/:id')
  @ApiOperation({ summary: 'Get any member account by id' })
  @ApiOkResponse({ description: 'Member with organization and roles' })
  getManagedUser(@Param('id') id: string) {
    return this.platformService.getManagedUser(id);
  }

  @Patch('managed-users/:id')
  @ApiOperation({ summary: 'Update any member (profile, status)' })
  @ApiOkResponse({ description: 'Updated member' })
  updateManagedUser(
    @Param('id') id: string,
    @Body() dto: UpdateManagedUserDto,
  ) {
    return this.platformService.updateManagedUser(id, dto);
  }

  @Delete('managed-users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Block any member (hard block, history preserved)',
  })
  @ApiOkResponse({ description: 'Blocked member' })
  removeManagedUser(
    @Param('id') id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ) {
    return this.platformService.removeManagedUser(
      id,
      caller.userId ?? null,
    );
  }

  @Delete('managed-users/:id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'PERMANENTLY delete any member row (never yourself, never the last owner)',
  })
  @ApiOkResponse({ description: 'Permanent deletion result' })
  removeManagedUserPermanently(
    @Param('id') id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ) {
    return this.platformService.removeManagedUserPermanently(
      id,
      caller.userId ?? null,
    );
  }
}
