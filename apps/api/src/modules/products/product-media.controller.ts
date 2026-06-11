import { Controller, Get, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ProductMediaService } from './product-media.service';

/**
 * Public, UNAUTHENTICATED read-through for product marketing blobs (photos and
 * brochure PDFs) stored in object storage.
 *
 * This controller has NO guards on purpose: an <img>/<a> tag cannot send a
 * Bearer header. Safety comes from the service, which only ever resolves files
 * that were explicitly flagged `visibility = 'public'` AND are attached to a
 * product. `:fileId` is a UUID looked up in the DB — the object key is read
 * from the row, never built from user input, so there is no path traversal.
 */
@Controller('products/media')
export class ProductMediaController {
  constructor(private readonly media: ProductMediaService) {}

  @Get(':fileId')
  async stream(@Param('fileId') fileId: string, @Res() reply: FastifyReply): Promise<void> {
    const resolved = await this.media.resolvePublicMedia(fileId);
    if (!resolved) {
      reply.code(404).send({ statusCode: 404, message: 'Bulunamadı' });
      return;
    }
    reply
      .header('Content-Type', resolved.mimeType)
      .header('Content-Length', resolved.sizeBytes)
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(resolved.filename)}"`)
      // These are non-confidential, immutable marketing assets keyed by UUID.
      .header('Cache-Control', 'public, max-age=86400, immutable')
      // Allow the SPA on a different origin to embed the image/pdf (helmet
      // otherwise defaults Cross-Origin-Resource-Policy to same-origin).
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(resolved.body);
  }
}
