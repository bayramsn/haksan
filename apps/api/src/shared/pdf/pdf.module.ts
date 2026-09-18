import { Module } from '@nestjs/common';
import { HtmlPdfService } from './html-pdf.service';

/**
 * Tek Chromium: servis modül kapsamlı olduğundan her `providers: [HtmlPdfService]`
 * ayrı bir tarayıcı süreci başlatıp kapanışa kadar tutar. PDF üreten modüller
 * (mail eki, haftalık rapor cron'u) bu modülü içe aktarır, kendi örneğini kurmaz.
 */
@Module({
  providers: [HtmlPdfService],
  exports: [HtmlPdfService],
})
export class PdfModule {}
