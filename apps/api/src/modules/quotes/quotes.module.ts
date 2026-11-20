import { CommercialPdfService } from './commercial-pdf.service';
import { CommercialPdfController } from './commercial-pdf.controller';
import { PdfModule } from '../../shared/pdf/pdf.module';
import { Module } from '@nestjs/common';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { CommercialDocumentsController } from './commercial-documents.controller';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { AuditService } from '../../shared/database/audit.service';
import { FxModule } from '../fx/fx.module';
import { SignaturesModule } from '../signatures/signatures.module';

@Module({
  // SignaturesModule: belgeye iliştirilen imzanın kiracı/bölüm/aktiflik
  // doğrulaması ve belgeye gömülen kopyası oradaki servisten gelir.
  imports: [PdfModule, FxModule, SignaturesModule, OpportunitiesModule],
  controllers: [CommercialPdfController, QuotesController, CommercialDocumentsController],
  providers: [CommercialPdfService, QuotesService, AuditService],
  exports: [QuotesService, CommercialPdfService],
})
export class QuotesModule {}
