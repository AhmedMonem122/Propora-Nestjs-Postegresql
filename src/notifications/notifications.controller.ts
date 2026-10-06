import {
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiBearerAuth()
@ApiTags('notifications')
@Controller('notifications')
@RequirePermissions('notification:read')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  @ApiQuery({ name: 'unreadOnly', required: false })
  @ApiOkResponse({ description: 'Paginated notifications' })
  findMine(
    @Query() query: PaginationQueryDto & { unreadOnly?: boolean | string },
  ) {
    return this.notificationsService.findMine({
      ...query,
      unreadOnly: query.unreadOnly === true || query.unreadOnly === 'true',
    });
  }

  @Patch(':id/read')
  @RequirePermissions('notification:update')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiOkResponse({ description: 'Updated notification' })
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }

  @Post('read-all')
  @RequirePermissions('notification:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  markAllRead() {
    return this.notificationsService.markAllRead();
  }
}
