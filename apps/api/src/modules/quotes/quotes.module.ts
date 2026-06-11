import { Module } from '@nestjs/common';
import { CommercialDocumentsController } from './commercial-documents.controller';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { AuditService } from '../../shared/database/audit.service';

@Module({
  controllers: [QuotesController, CommercialDocumentsController],
  providers: [QuotesService, AuditService],
  exports: [QuotesService],
})
export class QuotesModule {}
