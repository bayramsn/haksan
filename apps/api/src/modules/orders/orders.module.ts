import { Module } from '@nestjs/common';
import { AuditService } from '../../shared/database/audit.service';
import { OrdersService } from './orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { SalesOrdersController } from './sales-orders.controller';

@Module({
  controllers: [SalesOrdersController, PurchaseOrdersController],
  providers: [OrdersService, AuditService],
  exports: [OrdersService],
})
export class OrdersModule {}
