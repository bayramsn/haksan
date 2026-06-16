/**
 * Prometheus metrics. Uses a dedicated registry (not the global default) so it
 * is deterministic across test app instances and avoids double-registration.
 *
 * Cardinality safety: HTTP labels use the ROUTE TEMPLATE (e.g. /quotes/:id),
 * never the raw URL, and unmatched routes collapse to "unmatched".
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests, by method/route/status.',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds, by method/route/status.',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const unhandledExceptionsTotal = new Counter({
  name: 'http_unhandled_exceptions_total',
  help: 'Total exceptions surfaced to the global exception filter, by error code.',
  labelNames: ['code'] as const,
  registers: [registry],
});

export function recordHttpMetric(method: string, route: string, status: number, durationMs: number): void {
  const labels = { method, route, status: String(status) };
  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, durationMs / 1000);
}

export function incUnhandledException(code: string): void {
  unhandledExceptionsTotal.inc({ code });
}

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export const metricsContentType = registry.contentType;

/**
 * Expose GET /metrics outside the Nest router (same pattern as health routes).
 * If METRICS_TOKEN is set, require `Authorization: Bearer <token>`; otherwise the
 * endpoint is open (typical when scraped over a private network/agent).
 */
export function registerMetricsEndpoint(app: NestFastifyApplication): void {
  const token = process.env.METRICS_TOKEN;
  const adapter = app.getHttpAdapter();

  adapter.get(
    '/metrics',
    async (
      req: { headers: Record<string, string | string[] | undefined> },
      res: { header: (k: string, v: string) => void; status: (c: number) => { send: (b: unknown) => void }; send: (b: unknown) => void }
    ) => {
      if (token) {
        const auth = req.headers['authorization'];
        const value = Array.isArray(auth) ? auth[0] : auth;
        if (value !== `Bearer ${token}`) {
          res.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'metrics token required' } });
          return;
        }
      }
      res.header('content-type', metricsContentType);
      res.send(await renderMetrics());
    }
  );
}
