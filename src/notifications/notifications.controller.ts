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
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationQueryDto } from './dto/notification-query.dto.js';

@ApiBearerAuth()
@ApiTags('notifications')
@Controller('notifications')
@RequirePermissions('notification:read')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  @ApiOkResponse({ description: 'Paginated notifications' })
  findMine(@Query() query: NotificationQueryDto) {
    return this.notificationsService.findMine(query);
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
