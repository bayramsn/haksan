import { CommercialPdfMediaService } from './commercial-pdf-media.service';
import { SignatureMediaService } from '../signatures/signature-media.service';
import { ProductMediaService } from '../products/product-media.service';
import { BrandMediaService } from '../products/brand-media.service';
import { Module } from '@nestjs/common';
import { PdfModule } from '../../shared/pdf/pdf.module';
import { CommercialDocumentsController } from './commercial-documents.controller';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { AuditService } from '../../shared/database/audit.service';
import { FxModule } from '../fx/fx.module';
import { SignaturesModule } from '../signatures/signatures.module';

@Module({
  // SignaturesModule: belgeye iliştirilen imzanın kiracı/bölüm/aktiflik
  // doğrulaması ve belgeye gömülen kopyası oradaki servisten gelir.
  imports: [FxModule, SignaturesModule, PdfModule],
  controllers: [QuotesController, CommercialDocumentsController],
  providers: [QuotesService, AuditService, CommercialPdfMediaService, SignatureMediaService, ProductMediaService, BrandMediaService],
  exports: [QuotesService],
})
export class QuotesModule {}
