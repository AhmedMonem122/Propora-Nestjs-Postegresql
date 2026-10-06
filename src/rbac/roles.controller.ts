import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Body } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { RoleResponseDto } from '../common/dto/role-response.dto.js';
import { RolesService } from './roles.service.js';
import { RbacService } from './rbac.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

@ApiBearerAuth()
@ApiTags('rbac')
@Controller('roles')
@RequirePermissions('role:read')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly rbacService: RbacService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List organization roles' })
  @ApiOkResponse({ type: RoleResponseDto, isArray: true })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('permissions')
  @ApiOperation({ summary: 'List the global permission catalog' })
  @ApiOkResponse({ description: 'Permission catalog' })
  listPermissions() {
    return this.rbacService.getPermissionCatalog();
  }

  @Post()
  @RequirePermissions('role:create')
  @ApiOperation({ summary: 'Create a custom role with selected permissions' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a role by id' })
  @ApiOkResponse({ type: RoleResponseDto })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('role:update')
  @ApiOperation({ summary: 'Update a role name, description or permissions' })
  @ApiOkResponse({ type: RoleResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('role:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a custom role and unassign it from users' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
