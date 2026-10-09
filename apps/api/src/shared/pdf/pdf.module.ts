import { Module } from '@nestjs/common';
import { HtmlPdfService } from './html-pdf.service';
import { PdfController } from './pdf.controller';

/**
 * Tek Chromium: servis modül kapsamlı olduğundan her `providers: [HtmlPdfService]`
 * ayrı bir tarayıcı süreci başlatıp kapanışa kadar tutar. PDF üreten modüller
 * (mail eki, haftalık rapor cron'u) bu modülü içe aktarır, kendi örneğini kurmaz.
 */
@Module({
  // PdfController: belge "İndir" düğmesinin PDF'i (bkz. pdf.controller.ts).
  controllers: [PdfController],
  providers: [HtmlPdfService],
  exports: [HtmlPdfService],
})
export class PdfModule {}
