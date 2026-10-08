import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { TenantContextService } from '../database/tenant-context.service.js';
import { AuditService } from './audit.service.js';
import { AuditLogQueryDto } from './dto/audit-log-query.dto.js';

@ApiBearerAuth()
@ApiTags('audit')
@Controller('audit-logs')
@RequirePermissions('audit:read')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the organization audit log (newest first)' })
  @ApiOkResponse({ description: 'Paginated audit entries' })
  findAll(@Query() query: AuditLogQueryDto) {
    const organizationId = this.tenantContext.requireOrganizationId();
    return this.auditService.findAll(organizationId, query);
  }
}
