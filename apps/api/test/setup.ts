/**
 * Boots the full Nest app against the live Docker Postgres. Tests assume
 * `npm run db:migrate && npm run db:seed:demo` has been run.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/filters/all-exceptions.filter';
import { loadEnv } from '../src/config/env';
import { registerHealthRoutes } from '../src/health.routes';
import { registerLenientJsonBodyParser } from '../src/shared/http/fastify-json-body';

export async function createTestApp(): Promise<NestFastifyApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { logger: false }
  );
  await app.register(cookie as any, { secret: env.JWT_REFRESH_SECRET });
  await app.register(cors as any, { origin: true, credentials: true });
  app.setGlobalPrefix(env.API_PREFIX.replace(/^\//, ''));
  app.useGlobalFilters(new AllExceptionsFilter());
  registerHealthRoutes(app, env.API_PREFIX);
  await app.init();
  registerLenientJsonBodyParser(app);
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
