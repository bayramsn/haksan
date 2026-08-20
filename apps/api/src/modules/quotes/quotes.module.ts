import { Module } from '@nestjs/common';
import { CommercialDocumentsController } from './commercial-documents.controller';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { AuditService } from '../../shared/database/audit.service';
import { FxModule } from '../fx/fx.module';
import { SignaturesModule } from '../signatures/signatures.module';

@Module({
  // SignaturesModule: belgeye iliştirilen imzanın kiracı/bölüm/aktiflik
  // doğrulaması ve belgeye gömülen kopyası oradaki servisten gelir.
  imports: [FxModule, SignaturesModule],
  controllers: [QuotesController, CommercialDocumentsController],
  providers: [QuotesService, AuditService],
  exports: [QuotesService],
})
export class QuotesModule {}
