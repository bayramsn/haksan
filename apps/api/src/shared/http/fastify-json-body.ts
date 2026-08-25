import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ALLOWED_MIME_TYPES } from '@haksan/shared';

/** Fastify varsayılan JSON ayrıştırıcısı boş gövdeyi reddeder; refresh gibi body-less POST'lar için gevşet. */
export function registerLenientJsonBodyParser(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance();
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    // Meta gibi imzalı webhook sağlayıcıları HMAC'i ayrıştırılmış nesne üzerinden
    // değil, gönderilen baytların birebir karşılığı üzerinden hesaplar. JSON
    // ayrıştırılmadan önce ham gövdeyi sakla; controller yalnız imzalı endpoint'te
    // bunu kullanır ve normal API yanıtlarına/loglarına taşımaz.
    req.rawBody = typeof body === 'string' ? body : undefined;
    if (body === '' || body == null) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Signed URL uploads normally go directly from browser to S3/R2. If bucket CORS
  // blocks that PUT, the web client falls back to PUT /files/:id/content and the
  // API uploads the same bytes server-side. These parsers keep those bodies as
  // Buffer instead of treating file MIME types as unsupported content.
  for (const contentType of [...ALLOWED_MIME_TYPES, 'application/octet-stream']) {
    if (fastify.hasContentTypeParser(contentType)) continue;
    fastify.addContentTypeParser(contentType, { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body);
    });
  }
}
