import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { assertJsonComplexity } from '../src/shared/validation/json-complexity';
import { ZodValidationPipe } from '../src/shared/utils/zod-pipe';
import { registerLenientJsonBodyParser } from '../src/shared/http/fastify-json-body';

describe('JSON complexity boundaries before schema validation', () => {
  it('rejects oversized collections before Zod allocates per-element issues', () => {
    const schema = z.array(z.string());
    const parse = vi.spyOn(schema, 'safeParse');
    expect(() => new ZodValidationPipe(schema).transform(Array(10_001).fill(0))).toThrow('İstek çok fazla');
    expect(parse).not.toHaveBeenCalled();
  });

  it('bounds depth and combined nested collections without recursive traversal', () => {
    let nested: unknown = 1;
    for (let i = 0; i < 40; i++) nested = { child: nested };
    expect(() => assertJsonComplexity(nested)).toThrow();
    expect(() => assertJsonComplexity(Array.from({ length: 100 }, () => Array(1000).fill(0)))).toThrow();
    expect(() => assertJsonComplexity(Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`key${i}`, 1])))).toThrow();
  });

  it('preserves existing bulk ID and product-import sizes, large HTML strings and raw uploads', () => {
    expect(() => assertJsonComplexity({ opportunityIds: Array(10_000).fill('id') })).not.toThrow();
    const rows = Array.from({ length: 5000 }, (_, i) => ({ model: `Model ${i}`, brand: 'Haksan', currency: 'EUR', price: 1, specs: [] }));
    expect(() => assertJsonComplexity({ rows })).not.toThrow();
    expect(() => assertJsonComplexity({ html: 'x'.repeat(8_000_000) })).not.toThrow();
    expect(() => assertJsonComplexity(Buffer.alloc(25 * 1024 * 1024))).not.toThrow();
  });

  it('guards parsed JSON globally while preserving exact signed raw body', () => {
    const parsers = new Map<string, Function>();
    const fastify = { removeContentTypeParser: vi.fn(), hasContentTypeParser: () => false,
      addContentTypeParser: (type: string, _options: unknown, fn: Function) => parsers.set(type, fn) };
    registerLenientJsonBodyParser({ getHttpAdapter: () => ({ getInstance: () => fastify }) } as any);
    const body = JSON.stringify({ values: Array(10_001).fill(0) });
    const request: Record<string, unknown> = {};
    const done = vi.fn();
    parsers.get('application/json')!(request, body, done);
    expect(request.rawBody).toBe(body);
    expect(done.mock.calls[0][0]).toMatchObject({ statusCode: 413, code: 'INPUT_TOO_COMPLEX' });
    const bytes = Buffer.from('binary');
    parsers.get('application/octet-stream')!({}, bytes, done);
    expect(done).toHaveBeenLastCalledWith(null, bytes);
  });

  it('keeps normal Zod validation and body-less JSON behavior', () => {
    const pipe = new ZodValidationPipe(z.object({ name: z.string() }));
    expect(pipe.transform({ name: 'Haksan' })).toEqual({ name: 'Haksan' });
    expect(() => pipe.transform({ name: 1 })).toThrow('Doğrulama hatası');
  });
});
