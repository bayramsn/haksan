import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { FinanceModule } from '../finance/finance.module';
import { TradeFairsModule } from '../trade-fairs/trade-fairs.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [FinanceModule, ReportsModule, TradeFairsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
