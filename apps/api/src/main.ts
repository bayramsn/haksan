// MUST be first: starts OTel/Sentry before pg/http are required (no-op unless
// OTEL_EXPORTER_OTLP_ENDPOINT / SENTRY_DSN are set).
import { shutdownTelemetry } from './shared/observability/telemetry';
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
import { closeDb } from './db/client';
import { registerHealthRoutes } from './health.routes';
import { registerHttpObservability } from './shared/observability/http-logging';
import { registerMetricsEndpoint } from './shared/observability/metrics';
import { registerLenientJsonBodyParser } from './shared/http/fastify-json-body';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      // Güvenilir proxy sayısına sabitle: istemcinin X-Forwarded-For ile sahte IP
      // enjekte edip rate-limit/lockout'u atlatmasını ve log zehirlemesini önler.
      trustProxy: env.TRUST_PROXY_HOPS,
      bodyLimit: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    }),
    { bufferLogs: true }
  );

  await app.register(helmet as any, {
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    // Clickjacking: çerçeveye gömülmeyi tamamen reddet (helmet default SAMEORIGIN'den sıkı).
    frameguard: { action: 'deny' },
  });
  // Cookie imzalama sırrı JWT_REFRESH_SECRET'ten ayrılır (verilmişse); sır yeniden-kullanımını önler.
  await app.register(cookie as any, { secret: env.COOKIE_SECRET ?? env.JWT_REFRESH_SECRET });
  await app.register(cors as any, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix(env.API_PREFIX.replace(/^\//, ''));
  app.useGlobalFilters(new AllExceptionsFilter());

  registerHttpObservability(app);
  registerMetricsEndpoint(app);
  registerHealthRoutes(app, env.API_PREFIX);

  await app.init();
  registerLenientJsonBodyParser(app);

  await app.listen(env.PORT, '0.0.0.0');
  logger.info({ port: env.PORT, prefix: env.API_PREFIX, env: env.NODE_ENV }, '[api] up');

  // Graceful shutdown — systemd/docker restart'larında bağlantıları temiz kapat.
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, '[api] kapatılıyor');
    try {
      await app.close();
      await closeDb();
      await shutdownTelemetry();
    } catch (err) {
      logger.error({ err }, '[api] kapanış hatası');
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, '[api] bootstrap failed');
  process.exit(1);
});
