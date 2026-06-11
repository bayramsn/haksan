import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  inventoryItemCreateSchema,
  inventoryItemUpdateSchema,
  inventoryReserveSchema,
  inventorySellSchema,
  warehouseCreateSchema,
  paginationSchema,
  type InventoryItemCreateInput,
  type InventoryItemUpdateInput,
  type InventoryReserveInput,
  type InventorySellInput,
  type WarehouseCreateInput,
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { InventoryService } from './inventory.service';

const listQuery = z.object({ search: z.string().optional(), statusCode: z.string().optional() });
const cdQuery = z.object({ companyId: z.string().optional() });

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @RequirePermissions('warehouses.read')
  @Get('warehouses')
  listWarehouses(@CurrentUser() user: AuthContext) {
    return this.svc.listWarehouses(user);
  }

  @RequirePermissions('warehouses.create')
  @Post('warehouses')
  createWarehouse(@Body(new ZodValidationPipe(warehouseCreateSchema)) body: WarehouseCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createWarehouse(body, user);
  }

  @RequirePermissions('inventory.read')
  @Get('inventory')
  list(
    @Query(new ZodValidationPipe(listQuery.merge(paginationSchema)))
    qp: z.infer<typeof listQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.list(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('inventory.read')
  @Get('inventory/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
  }

  @RequirePermissions('inventory.read')
  @Get('inventory/serial/:serial')
  bySerial(@Param('serial') serial: string, @CurrentUser() user: AuthContext) {
    return this.svc.findBySerial(serial, user);
  }

  @RequirePermissions('inventory.create')
  @Post('inventory')
  create(@Body(new ZodValidationPipe(inventoryItemCreateSchema)) body: InventoryItemCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.create(body, user);
  }

  @RequirePermissions('inventory.update')
  @Patch('inventory/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(inventoryItemUpdateSchema)) body: InventoryItemUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.update(id, body, user);
  }

  @RequirePermissions('inventory.update')
  @Patch('inventory/:id/reserve')
  reserve(@Param('id') id: string, @Body(new ZodValidationPipe(inventoryReserveSchema)) body: InventoryReserveInput, @CurrentUser() user: AuthContext) {
    return this.svc.reserve(id, body, user);
  }

  @RequirePermissions('inventory.update')
  @Patch('inventory/:id/sell')
  sell(@Param('id') id: string, @Body(new ZodValidationPipe(inventorySellSchema)) body: InventorySellInput, @CurrentUser() user: AuthContext) {
    return this.svc.sell(id, body, user);
  }

  @RequirePermissions('customer_devices.read')
  @Get('customer-devices')
  cd(
    @Query(new ZodValidationPipe(cdQuery.merge(paginationSchema)))
    qp: z.infer<typeof cdQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.listCustomerDevices(user, query, { page, pageSize, sortBy, sortDir });
  }
}
