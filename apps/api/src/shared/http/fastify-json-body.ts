import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/** Fastify varsayılan JSON ayrıştırıcısı boş gövdeyi reddeder; refresh gibi body-less POST'lar için gevşet. */
export function registerLenientJsonBodyParser(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance();
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
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
}
