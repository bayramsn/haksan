import { Controller, Get, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../../shared/security/auth.guard';
import { SignatureMediaService } from './signature-media.service';

/**
 * İmza görselinin auth'suz sunumu (brand-media'nın birebir muadili).
 * Yazdırma penceresi çerez taşımadığı için bu uç `@Public()` olmak zorundadır;
 * neyin sunulabileceği servis katmanında daraltılır.
 */
@Controller('signatures/media')
export class SignatureMediaController {
  constructor(private readonly media: SignatureMediaService) {}

  @Public()
  @Get(':fileId')
  async stream(@Param('fileId') fileId: string, @Res() reply: FastifyReply): Promise<void> {
    const resolved = await this.media.resolvePublicSignature(fileId);
    if (!resolved) {
      reply.code(404).send({ statusCode: 404, message: 'Bulunamadı' });
      return;
    }
    reply
      .header('Content-Type', resolved.mimeType)
      .header('Content-Length', resolved.sizeBytes)
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(resolved.filename)}"`)
      .header('Cache-Control', 'public, max-age=86400, immutable')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(resolved.body);
  }
}
