import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  orderStatusUpdateSchema,
  paginationSchema,
  purchaseOrderCreateSchema,
  purchaseOrderItemCreateSchema,
  purchaseOrderItemUpdateSchema,
  purchaseOrderUpdateSchema,
  type OrderStatusUpdateInput,
  type Pagination,
  type PurchaseOrderCreateInput,
  type PurchaseOrderItemCreateInput,
  type PurchaseOrderItemUpdateInput,
  type PurchaseOrderUpdateInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { OrdersService } from './orders.service';

const listQuery = z.object({ search: z.string().optional(), statusCode: z.string().optional(), supplierCompanyId: z.string().optional() });

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly svc: OrdersService) {}

  @RequirePermissions('purchase_orders.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(listQuery.merge(paginationSchema)))
    qp: z.infer<typeof listQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.listPurchaseOrders(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('purchase_orders.read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.getPurchaseOrder(id, user);
  }

  @RequirePermissions('purchase_orders.create')
  @Post()
  create(@Body(new ZodValidationPipe(purchaseOrderCreateSchema)) body: PurchaseOrderCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createPurchaseOrder(body, user);
  }

  @RequirePermissions('purchase_orders.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(purchaseOrderUpdateSchema)) body: PurchaseOrderUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updatePurchaseOrder(id, body, user);
  }

  @RequirePermissions('purchase_orders.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.deletePurchaseOrder(id, user);
  }

  @RequirePermissions('purchase_orders.update')
  @Post(':id/items')
  addItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(purchaseOrderItemCreateSchema)) body: PurchaseOrderItemCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.addPurchaseOrderItem(id, body, user);
  }

  @RequirePermissions('purchase_orders.update')
  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(purchaseOrderItemUpdateSchema)) body: PurchaseOrderItemUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updatePurchaseOrderItem(id, itemId, body, user);
  }

  @RequirePermissions('purchase_orders.update')
  @Delete(':id/items/:itemId')
  deleteItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthContext) {
    return this.svc.deletePurchaseOrderItem(id, itemId, user);
  }

  @RequirePermissions('purchase_orders.update')
  @Post(':id/send')
  send(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.setPurchaseOrderStatus(id, { statusCode: 'sent' }, user);
  }

  @RequirePermissions('purchase_orders.approve')
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.setPurchaseOrderStatus(id, { statusCode: 'approved' }, user);
  }

  @RequirePermissions('purchase_orders.update')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderStatusUpdateSchema)) body: OrderStatusUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.setPurchaseOrderStatus(id, body, user);
  }
}
