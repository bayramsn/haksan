/**
 * HTTP observability: request correlation IDs + a single structured access log
 * line per request. Registered as Fastify lifecycle hooks so they run for every
 * route, including those outside the Nest router (health endpoints).
 */
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';
import { recordHttpMetric } from './metrics';
import { redactRequestPath } from './redact-request-path';

export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Reuse a safe incoming correlation id or mint a UUID for untrusted input. */
export function resolveRequestId(req: FastifyRequest): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const value = (Array.isArray(incoming) ? incoming[0] : incoming)?.trim();
  return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}

function isLowSignalRoute(route: string): boolean {
  return route === '/' || route.startsWith('/health');
}

export function registerHttpObservability(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;

  // Correlation ID: available to guards/handlers via req.requestId and echoed
  // back so clients and support can reference a single request.
  fastify.addHook('onRequest', (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const requestId = resolveRequestId(req);
    req.requestId = requestId;
    reply.header(REQUEST_ID_HEADER, requestId);
    done();
  });

  // One access-log line per response. req.auth is populated by AuthGuard before
  // the handler runs, so tenant/user are present here for authenticated routes.
  fastify.addHook('onResponse', (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Route template (e.g. /quotes/:id) keeps metric/label cardinality bounded;
    // raw URL is only used for the human-readable access log line.
    const template = req.routeOptions?.url;
    const route = template ?? redactRequestPath(req.url);
    const ms = Math.round(reply.elapsedTime);

    recordHttpMetric(req.method, template ?? 'unmatched', reply.statusCode, reply.elapsedTime);

    const payload = {
      requestId: req.requestId,
      method: req.method,
      route,
      status: reply.statusCode,
      durationMs: ms,
      tenantId: req.auth?.tenantId,
      userId: req.auth?.userId,
    };
    if (isLowSignalRoute(route) && reply.statusCode < 400) {
      logger.debug(payload, 'request');
    } else {
      logger.info(payload, 'request');
    }
    done();
  });
}
