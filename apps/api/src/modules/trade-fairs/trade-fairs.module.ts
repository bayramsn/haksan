import { Module } from '@nestjs/common';
import { TradeFairsController } from './trade-fairs.controller';
import { TradeFairsService } from './trade-fairs.service';
import { AuditService } from '../../shared/database/audit.service';

@Module({
  controllers: [TradeFairsController],
  providers: [TradeFairsService, AuditService],
})
export class TradeFairsModule {}
