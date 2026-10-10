import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import {
  buildPaginationMeta,
  normalizePagination,
  paginated,
} from '../common/utils/pagination.util.js';
import {
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
} from './dto/webhook.dto.js';

const DELIVERY_TIMEOUT_MS = 8000;

/**
 * Outgoing webhooks: tenant apps subscribe HTTPS endpoints to domain events
 * and receive signed JSON deliveries (HMAC-SHA256, `sha256=<hex>`), with a
 * per-delivery attempt log for debugging.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private orgId(): string {
    return this.tenant.requireOrganizationId();
  }

  async create(dto: CreateWebhookEndpointDto) {
    const organizationId = this.orgId();
    const secret = randomBytes(32).toString('hex');

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        organizationId,
        url: dto.url,
        secret,
        events: dto.events ?? [],
      },
    });

    // The secret is revealed exactly once, at creation time.
    return endpoint;
  }

  async findAll() {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { organizationId: this.orgId() },
      orderBy: { createdAt: 'desc' },
    });
    return endpoints.map((endpoint) => this.hideSecret(endpoint));
  }

  async findOne(id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, organizationId: this.orgId() },
    });
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    return this.hideSecret(endpoint);
  }

  async update(id: string, dto: UpdateWebhookEndpointDto) {
    await this.findOne(id);
    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(dto.url ? { url: dto.url } : {}),
        ...(dto.events ? { events: dto.events } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return this.hideSecret(endpoint);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { id, deleted: true };
  }

  async rotateSecret(id: string) {
    await this.findOne(id);
    const secret = randomBytes(32).toString('hex');
    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: { secret },
    });
  }

  async deliveries(
    endpointId: string,
    query: { page?: number; limit?: number; success?: boolean },
  ) {
    const endpoint = await this.findOne(endpointId);
    const { page, limit, skip, take } = normalizePagination(query);
    const where: Prisma.WebhookDeliveryWhereInput = {
      endpointId: endpoint.id,
      ...(query.success !== undefined ? { success: query.success } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.webhookDelivery.count({ where }),
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return paginated(items, buildPaginationMeta(total, page, limit));
  }

  async sendTestPing(endpointId: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, organizationId: this.orgId() },
    });
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    return this.deliver(endpoint, 'ping', { message: 'Propora test ping' });
  }

  /**
   * Fan-out to every active endpoint subscribed to `event`
   * (empty `events` = subscribed to everything). Never throws.
   */
  async dispatch(
    organizationId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [{ events: { isEmpty: true } }, { events: { has: event } }],
      },
    });

    await Promise.allSettled(
      endpoints.map((endpoint) =>
        this.deliver(endpoint, event, payload).catch((error) => {
          this.logger.warn(
            `Webhook delivery to ${endpoint.url} failed: ${(error as Error)?.message}`,
          );
        }),
      ),
    );
  }

  private async deliver(
    endpoint: {
      id: string;
      organizationId: string;
      url: string;
      secret: string;
    },
    event: string,
    payload: Record<string, unknown>,
  ) {
    const deliveryId = randomUUID();
    const body = JSON.stringify({
      id: deliveryId,
      event,
      organizationId: endpoint.organizationId,
      occurredAt: new Date().toISOString(),
      data: payload,
    });
    const signature = `sha256=${createHmac('sha256', endpoint.secret).update(body).digest('hex')}`;

    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        id: deliveryId,
        endpointId: endpoint.id,
        event,
        payload: (JSON.parse(body) as Prisma.InputJsonValue),
        attempts: 1,
      },
    });

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Propora-Event': event,
          'X-Propora-Delivery': delivery.id,
          'X-Propora-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      const ok = response.status >= 200 && response.status < 300;
      return this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          success: ok,
          statusCode: response.status,
          error: ok ? null : `HTTP ${response.status}`,
        },
      });
    } catch (error) {
      const message =
        (error as Error)?.name === 'TimeoutError' ||
        (error as Error)?.name === 'AbortError'
          ? `Endpoint timed out after ${DELIVERY_TIMEOUT_MS}ms`
          : `Request failed: ${(error as Error)?.message}`;
      return this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { success: false, error: message },
      });
    }
  }

  private hideSecret<T extends { secret: string }>(
    endpoint: T,
  ): Omit<T, 'secret'> {
    const { secret: _secret, ...rest } = endpoint;
    return rest;
  }
}
