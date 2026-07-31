import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import type { FastifyRequest } from 'fastify';
import { buildLoggerOptions } from '../src/shared/utils/logger';
import { resolveRequestId } from '../src/shared/observability/http-logging';
import { redactRequestPath } from '../src/shared/observability/redact-request-path';
import { StructuredNestLogger } from '../src/shared/observability/nest-logger';

describe('production observability contract', () => {
  it('writes structured JSON with stable service fields and redacts secrets', () => {
    const lines: string[] = [];
    const sink = { write: (line: string) => lines.push(line) };
    const testLogger = pino(buildLoggerOptions({ NODE_ENV: 'production' }), sink);

    testLogger.info(
      {
        requestId: 'req-123',
        route: '/api/v1/quotes/:id',
        durationMs: 42,
        password: 'plain-secret',
        auth: { accessToken: 'access-secret', nested: { refreshToken: 'refresh-secret' } },
      },
      'request'
    );

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      level: 'info',
      service: 'haksan-crm-api',
      environment: 'production',
      message: 'request',
      requestId: 'req-123',
      route: '/api/v1/quotes/:id',
      durationMs: 42,
      password: '[REDACTED]',
      auth: { accessToken: '[REDACTED]', nested: { refreshToken: '[REDACTED]' } },
    });
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
    expect(lines[0]).not.toContain('plain-secret');
    expect(lines[0]).not.toContain('access-secret');
    expect(lines[0]).not.toContain('refresh-secret');
  });

  it('accepts bounded correlation ids and replaces unsafe input', () => {
    const safe = resolveRequestId({ headers: { 'x-request-id': 'support.case-123:retry_2' } } as FastifyRequest);
    const unsafe = resolveRequestId({ headers: { 'x-request-id': 'bad\nforged-log-entry' } } as FastifyRequest);
    const oversized = resolveRequestId({ headers: { 'x-request-id': 'a'.repeat(129) } } as FastifyRequest);

    expect(safe).toBe('support.case-123:retry_2');
    expect(unsafe).toMatch(/^[0-9a-f-]{36}$/);
    expect(oversized).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('removes query strings and public complaint credentials from logged paths', () => {
    expect(redactRequestPath('/api/v1/quotes?token=secret')).toBe('/api/v1/quotes');
    expect(redactRequestPath('/public/service-complaints/ticket-1/raw-secret?x=1')).toBe(
      '/public/service-complaints/ticket-1/[REDACTED]'
    );
  });

  it('routes Nest framework messages through the structured logger', () => {
    const sink = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    };
    const nestLogger = new StructuredNestLogger(sink as any);

    nestLogger.log('Mapped {/api/v1/quotes, GET} route', 'RouterExplorer');
    nestLogger.error(new Error('startup failed'), 'NestApplication');

    expect(sink.info).toHaveBeenCalledWith(
      { component: 'nest', context: 'RouterExplorer' },
      'Mapped {/api/v1/quotes, GET} route'
    );
    expect(sink.error).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'nest', context: 'NestApplication', err: expect.any(Error) }),
      'startup failed'
    );
  });
});
