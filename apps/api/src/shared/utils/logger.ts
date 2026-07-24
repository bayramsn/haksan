import pino, { type LoggerOptions } from 'pino';
import { trace } from '@opentelemetry/api';
import { loadEnv } from '../../config/env';

const env = loadEnv();

type LoggerEnvironment = Pick<ReturnType<typeof loadEnv>, 'NODE_ENV'>;

/** Exported so the production JSON contract and redaction can be unit-tested. */
export function buildLoggerOptions(runtimeEnv: LoggerEnvironment): LoggerOptions {
  return {
    level: runtimeEnv.NODE_ENV === 'production' ? 'info' : 'debug',
    base: {
      service: 'haksan-crm-api',
      environment: runtimeEnv.NODE_ENV,
    },
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
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
        'password_hash',
        'newPassword',
        'token',
        'refreshToken',
        'accessToken',
        'authorization',
        'cookie',
        '*.password',
        '*.passwordHash',
        '*.password_hash',
        '*.token',
        '*.refreshToken',
        '*.accessToken',
        '*.authorization',
        '*.cookie',
        '*.*.password',
        '*.*.passwordHash',
        '*.*.password_hash',
        '*.*.token',
        '*.*.refreshToken',
        '*.*.accessToken',
        '*.*.authorization',
        '*.*.cookie',
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    transport:
      runtimeEnv.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
          }
        : undefined,
  };
}

export const logger = pino(buildLoggerOptions(env));
