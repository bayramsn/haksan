import { Controller, Get, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../../shared/security/auth.guard';
import { BrandMediaService } from './brand-media.service';

@Controller('brands/media')
export class BrandMediaController {
  constructor(private readonly media: BrandMediaService) {}

  @Public()
  @Get(':fileId')
  async stream(@Param('fileId') fileId: string, @Res() reply: FastifyReply): Promise<void> {
    const resolved = await this.media.resolvePublicLogo(fileId);
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
