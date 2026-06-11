import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { logger } from './shared/utils/logger';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: true,
      bodyLimit: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    }),
    { bufferLogs: true }
  );

  await app.register(helmet as any, {
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  });
  await app.register(cookie as any, { secret: env.JWT_REFRESH_SECRET });
  await app.register(cors as any, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix(env.API_PREFIX.replace(/^\//, ''));
  app.useGlobalFilters(new AllExceptionsFilter());

  // Health endpoint (no prefix)
  app.getHttpAdapter().get('/health', (_req: any, res: any) => res.send({ ok: true, ts: new Date().toISOString() }));

  await app.listen(env.PORT, '0.0.0.0');
  logger.info({ port: env.PORT, prefix: env.API_PREFIX, env: env.NODE_ENV }, '[api] up');
}

bootstrap().catch((err) => {
  logger.error({ err }, '[api] bootstrap failed');
  process.exit(1);
});
