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
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { AuditEntity } from '../audit/audit.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.interface.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { UserResponseDto } from '../common/dto/user-response.dto.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AssignRolesDto } from './dto/assign-roles.dto.js';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
@RequirePermissions('user:read')
@AuditEntity('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List organization members' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/UserResponseDto' } },
        meta: { $ref: '#/components/schemas/PaginationMetaDto' },
      },
    },
  })
  findAll(
    @Query() query: PaginationQueryDto & {
      search?: string;
      status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    },
  ) {
    return this.usersService.findAll(query);
  }

  @Post()
  @RequirePermissions('user:create')
  @ApiOperation({ summary: 'Invite a new member to the organization' })
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a member by id' })
  @ApiOkResponse({ type: UserResponseDto })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('user:update')
  @ApiOperation({ summary: 'Update a member profile or status' })
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, currentUser.userId);
  }

  @Patch(':id/roles')
  @RequirePermissions('user:update')
  @ApiOperation({ summary: 'Replace the roles assigned to a member' })
  @ApiOkResponse({ type: UserResponseDto })
  assignRoles(
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.usersService.assignRoles(id, dto, currentUser.userId);
  }

  @Delete(':id')
  @RequirePermissions('user:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.usersService.remove(id, currentUser.userId);
  }
}
