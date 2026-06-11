import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { AuditService } from '../../shared/database/audit.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, AuditService],
  exports: [InventoryService],
})
export class InventoryModule {}
