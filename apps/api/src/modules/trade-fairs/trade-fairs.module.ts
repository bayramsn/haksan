import { Module } from '@nestjs/common';
import { TradeFairsController } from './trade-fairs.controller';
import { TradeFairsService } from './trade-fairs.service';
import { AuditService } from '../../shared/database/audit.service';
import { CompaniesModule } from '../companies/companies.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [CompaniesModule, ContactsModule],
  controllers: [TradeFairsController],
  providers: [TradeFairsService, AuditService],
})
export class TradeFairsModule {}
