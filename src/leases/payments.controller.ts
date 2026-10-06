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
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { PaymentsService } from './payments.service.js';
import { CreatePaymentDto, UpdatePaymentDto } from './dto/payment.dto.js';

@ApiBearerAuth()
@ApiTags('leases')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('payments')
  @RequirePermissions('payment:read')
  @ApiOperation({ summary: 'List rent payments (filterable, overdue filter)' })
  @ApiQuery({ name: 'leaseId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'PAID', 'OVERDUE', 'REFUNDED'] })
  @ApiQuery({ name: 'overdue', required: false })
  @ApiQuery({ name: 'method', required: false })
  @ApiOkResponse({ description: 'Paginated payments' })
  findAll(
    @Query()
    query: PaginationQueryDto & {
      leaseId?: string;
      status?: 'PENDING' | 'PAID' | 'OVERDUE' | 'REFUNDED';
      method?: string;
      overdue?: boolean | string;
    },
  ) {
    return this.paymentsService.findAll({
      ...query,
      overdue: query.overdue === true || query.overdue === 'true',
    });
  }

  @Post('leases/:leaseId/payments')
  @RequirePermissions('payment:create')
  @ApiOperation({ summary: 'Record a rent payment for a lease' })
  @ApiCreatedResponse({ description: 'Created payment' })
  createForLease(
    @Param('leaseId') leaseId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.createForLease(leaseId, dto);
  }

  @Get('payments/:id')
  @RequirePermissions('payment:read')
  @ApiOperation({ summary: 'Get a payment by id' })
  @ApiOkResponse({ description: 'Payment details' })
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Patch('payments/:id')
  @RequirePermissions('payment:update')
  @ApiOperation({ summary: 'Update a payment (marks paidAt automatically when status becomes PAID)' })
  @ApiOkResponse({ description: 'Updated payment' })
  update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.paymentsService.update(id, dto);
  }

  @Delete('payments/:id')
  @RequirePermissions('payment:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a payment' })
  @ApiOkResponse({ description: 'Deletion result' })
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(id);
  }
}
