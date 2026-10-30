import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { printDocumentPdfSchema, type PrintDocumentPdf } from '@haksan/shared';
import { AuthGuard } from '../security/auth.guard';
import { CurrentUser } from '../security/current-user.decorator';
import type { AuthContext } from '../security/auth.types';
import { AppError, ForbiddenError } from '../utils/errors';
import { ZodValidationPipe } from '../utils/zod-pipe';
import { HtmlPdfService } from './html-pdf.service';

/**
 * Belge "İndir" düğmesi: tarayıcının "Yazdır / PDF Kaydet" belgesini (antet ve
 * görseller gömülü HTML) PDF olarak döndürür. İçerik istemcinin zaten gördüğü
 * belgedir, kayıt okunmaz; yine de Chromium yalnız belge üreten rollere açılır.
 * Render kapalı kutudadır (JS yok, ağ yok, eşzamanlılık ve sayfa tavanı var).
 */
const PDF_RENDER_PERMISSIONS = ['quotes.read', 'proformas.read', 'contracts.read', 'reports.export'];

@UseGuards(AuthGuard)
@Controller('pdf')
export class PdfController {
  constructor(private readonly htmlPdf: HtmlPdfService) {}

  @Post('render')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async render(
    @Body(new ZodValidationPipe(printDocumentPdfSchema)) body: PrintDocumentPdf,
    @CurrentUser() actor: AuthContext,
    @Res() res: FastifyReply
  ) {
    if (!PDF_RENDER_PERMISSIONS.some((permission) => actor.permissions.has(permission))) {
      throw new ForbiddenError('PDF üretmek için belge okuma yetkisi gerekli');
    }
    if (!this.htmlPdf.isAvailable()) {
      throw new AppError('PDF_UNAVAILABLE', 'Sunucuda PDF üretici (Chromium) bulunamadı', 503);
    }
    const content = await this.htmlPdf.render(body.html);
    const asciiName = body.filename.replace(/[^\x20-\x7e]/g, '_');
    res
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${asciiName}"`)
      .header('Cache-Control', 'private, no-store')
      .send(content);
  }
}
