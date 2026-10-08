import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { TenantContextService } from '../database/tenant-context.service.js';
import { AuditService } from './audit.service.js';
import {
  AUDIT_ACTION_KEY,
  AUDIT_ENTITY_KEY,
  type AuditOptions,
} from './audit.decorator.js';

const METHOD_TO_VERB: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * Records an audit row for decorated routes after the handler succeeds.
 * Failures of the audit write itself are logged and swallowed so observability
 * can never break the business request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const actionMeta = this.reflector.getAllAndOverride<
      ({ action: string } & AuditOptions) | undefined
    >(AUDIT_ACTION_KEY, [context.getHandler(), context.getClass()]);
    const entityMeta = this.reflector.getAllAndOverride<
      ({ entity: string } & AuditOptions) | undefined
    >(AUDIT_ENTITY_KEY, [context.getHandler(), context.getClass()]);

    const request = context.switchToHttp().getRequest();
    const httpMethod: string = request.method;

    let action = actionMeta?.action;
    const entity = actionMeta?.entity ?? entityMeta?.entity;
    const entityParam =
      actionMeta?.entityParam ?? entityMeta?.entityParam ?? 'id';

    if (!action && entity && httpMethod !== 'GET' && METHOD_TO_VERB[httpMethod]) {
      action = `${entity}.${METHOD_TO_VERB[httpMethod]}`;
    }

    if (!action) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (result) => {
          void this.record(request, action, entity, entityParam, result).catch(
            (error) => {
              this.logger.error(
                `Failed to write audit log for ${action}: ${(error as Error)?.message}`,
              );
            },
          );
        },
      }),
    );
  }

  private async record(
    request: {
      ip?: string;
      params?: Record<string, string>;
      user?: { userId?: string; organizationId?: string | null };
    },
    action: string,
    entity: string | undefined,
    entityParam: string,
    result: unknown,
  ): Promise<void> {
    let organizationId: string | null = null;
    try {
      organizationId = this.tenantContext.getOrganizationId();
    } catch {
      organizationId = request.user?.organizationId ?? null;
    }

    if (!organizationId) {
      return;
    }

    const fromParams = request.params?.[entityParam];
    const fromResult =
      result && typeof result === 'object'
        ? (result as Record<string, unknown>).id
        : undefined;

    await this.auditService.log({
      organizationId,
      userId: request.user?.userId ?? null,
      action,
      entityType: entity ?? null,
      entityId:
        typeof fromParams === 'string'
          ? fromParams
          : typeof fromResult === 'string'
            ? fromResult
            : null,
      ipAddress: request.ip ?? null,
    });
  }
}
