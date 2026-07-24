import { Module } from '@nestjs/common';
import { CommercialDocumentsController } from './commercial-documents.controller';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { AuditService } from '../../shared/database/audit.service';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [FxModule],
  controllers: [QuotesController, CommercialDocumentsController],
  providers: [QuotesService, AuditService],
  exports: [QuotesService],
})
export class QuotesModule {}
