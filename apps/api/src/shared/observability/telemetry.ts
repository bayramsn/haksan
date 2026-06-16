/**
 * Telemetry bootstrap: OpenTelemetry tracing (HTTP + pg) and Sentry error
 * reporting. Runs as a SIDE EFFECT on import and MUST be the first import in
 * main.ts so the OTel SDK starts before `pg`/`http` are required (auto
 * instrumentation hooks require() calls).
 *
 * Everything is opt-in via env and lazily required, so when unconfigured this
 * module loads nothing heavy and has zero runtime effect (dev/test/CI safe):
 *   - Tracing: enabled when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 *   - Sentry:  enabled when SENTRY_DSN is set (errors only; tracing handled by OTel).
 *
 * Trace/span ids are attached to every pino log line via a mixin in logger.ts,
 * giving logs <-> traces correlation.
 */

function release(): string | undefined {
  return process.env.GIT_COMMIT || process.env.RENDER_GIT_COMMIT || undefined;
}

function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: release(),
    // Tracing is owned by the OTel SDK below; let Sentry do error capture only
    // and not register its own (conflicting) OpenTelemetry provider.
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,
  });
  console.log('[telemetry] Sentry error reporting initialized');
}

// Holds the started SDK so main.ts can flush spans during graceful shutdown.
let sdkRef: { shutdown: () => Promise<void> } | undefined;

function initTracing(): void {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'haksan-api',
    // Endpoint + headers are read from OTEL_EXPORTER_OTLP_* env by the exporter.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs spans are extremely noisy and not useful here.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  sdkRef = sdk;
  console.log('[telemetry] OpenTelemetry tracing started (http + pg)');
}

/** Flush and stop the tracing SDK. Safe no-op when tracing is disabled. */
export async function shutdownTelemetry(): Promise<void> {
  if (sdkRef) await sdkRef.shutdown();
}

initSentry();
initTracing();
