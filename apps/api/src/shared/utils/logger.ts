import pino from 'pino';
import { trace } from '@opentelemetry/api';
import { loadEnv } from '../../config/env';

const env = loadEnv();

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  // Logs <-> traces correlation: when a request is inside an OTel span, stamp
  // every log line with its trace/span ids. No active span (dev/test, or tracing
  // disabled) -> returns nothing.
  mixin() {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const ctx = span.spanContext();
    return { traceId: ctx.traceId, spanId: ctx.spanId };
  },
  redact: {
    paths: [
      'password',
      'passwordHash',
      'newPassword',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
        }
      : undefined,
});
