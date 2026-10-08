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
import { AuditEntity } from '../audit/audit.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { WebhooksService } from './webhooks.service.js';
import {
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
} from './dto/webhook.dto.js';

@ApiBearerAuth()
@ApiTags('webhooks')
@Controller('webhooks')
@AuditEntity('webhook')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @RequirePermissions('webhook:read')
  @ApiOperation({ summary: 'List outgoing webhook endpoints (secrets hidden)' })
  @ApiOkResponse({ description: 'Webhook endpoints' })
  findAll() {
    return this.webhooksService.findAll();
  }

  @Post()
  @RequirePermissions('webhook:create')
  @ApiOperation({
    summary: 'Register an outgoing webhook endpoint (secret returned once)',
  })
  @ApiCreatedResponse({ description: 'Created endpoint including its secret' })
  create(@Body() dto: CreateWebhookEndpointDto) {
    return this.webhooksService.create(dto);
  }

  @Get(':id')
  @RequirePermissions('webhook:read')
  @ApiOperation({ summary: 'Get a webhook endpoint (secret hidden)' })
  @ApiOkResponse({ description: 'Webhook endpoint' })
  findOne(@Param('id') id: string) {
    return this.webhooksService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('webhook:update')
  @ApiOperation({ summary: 'Update a webhook endpoint' })
  @ApiOkResponse({ description: 'Updated endpoint (secret hidden)' })
  update(@Param('id') id: string, @Body() dto: UpdateWebhookEndpointDto) {
    return this.webhooksService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('webhook:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a webhook endpoint and its delivery log' })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.webhooksService.remove(id);
  }

  @Post(':id/rotate-secret')
  @RequirePermissions('webhook:update')
  @ApiOperation({ summary: 'Rotate an endpoint signing secret (returned once)' })
  @ApiOkResponse({ description: 'Endpoint with the new secret' })
  rotateSecret(@Param('id') id: string) {
    return this.webhooksService.rotateSecret(id);
  }

  @Post(':id/test')
  @RequirePermissions('webhook:update')
  @ApiOperation({ summary: 'Send a signed ping delivery to an endpoint' })
  @ApiOkResponse({ description: 'Delivery attempt result' })
  sendTest(@Param('id') id: string) {
    return this.webhooksService.sendTestPing(id);
  }

  @Get(':id/deliveries')
  @RequirePermissions('webhook:read')
  @ApiOperation({ summary: 'List delivery attempts for an endpoint' })
  @ApiOkResponse({ description: 'Paginated deliveries' })
  deliveries(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.webhooksService.deliveries(id, query);
  }
}
