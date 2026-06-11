import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  orderStatusUpdateSchema,
  paginationSchema,
  salesOrderCreateSchema,
  salesOrderFromQuoteSchema,
  salesOrderItemCreateSchema,
  salesOrderItemUpdateSchema,
  salesOrderUpdateSchema,
  type OrderStatusUpdateInput,
  type Pagination,
  type SalesOrderCreateInput,
  type SalesOrderFromQuoteInput,
  type SalesOrderItemCreateInput,
  type SalesOrderItemUpdateInput,
  type SalesOrderUpdateInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { OrdersService } from './orders.service';

const listQuery = z.object({ search: z.string().optional(), statusCode: z.string().optional(), companyId: z.string().optional() });

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly svc: OrdersService) {}

  @RequirePermissions('sales_orders.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(listQuery.merge(paginationSchema)))
    qp: z.infer<typeof listQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.listSalesOrders(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('sales_orders.read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.getSalesOrder(id, user);
  }

  @RequirePermissions('sales_orders.create')
  @Post()
  create(@Body(new ZodValidationPipe(salesOrderCreateSchema)) body: SalesOrderCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createSalesOrder(body, user);
  }

  @RequirePermissions('sales_orders.create')
  @Post('from-quote/:quoteId')
  createFromQuote(
    @Param('quoteId') quoteId: string,
    @Body(new ZodValidationPipe(salesOrderFromQuoteSchema)) body: SalesOrderFromQuoteInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createSalesOrderFromQuote(quoteId, body, user);
  }

  @RequirePermissions('sales_orders.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(salesOrderUpdateSchema)) body: SalesOrderUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updateSalesOrder(id, body, user);
  }

  @RequirePermissions('sales_orders.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.deleteSalesOrder(id, user);
  }

  @RequirePermissions('sales_orders.update')
  @Post(':id/items')
  addItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(salesOrderItemCreateSchema)) body: SalesOrderItemCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.addSalesOrderItem(id, body, user);
  }

  @RequirePermissions('sales_orders.update')
  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(salesOrderItemUpdateSchema)) body: SalesOrderItemUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updateSalesOrderItem(id, itemId, body, user);
  }

  @RequirePermissions('sales_orders.update')
  @Delete(':id/items/:itemId')
  deleteItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthContext) {
    return this.svc.deleteSalesOrderItem(id, itemId, user);
  }

  @RequirePermissions('sales_orders.approve')
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.setSalesOrderStatus(id, { statusCode: 'confirmed' }, user);
  }

  @RequirePermissions('sales_orders.update')
  @Post(':id/reserve')
  reserve(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.reserveSalesOrder(id, user);
  }

  @RequirePermissions('sales_orders.update')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderStatusUpdateSchema)) body: OrderStatusUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.setSalesOrderStatus(id, body, user);
  }
}
