import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from '../src/shared/utils/zod-pipe';

describe('Zod request validation budget', () => {
  it('rejects oversized input before allocating Zod validation issues', () => {
    const schema = z.array(z.string());
    const parse = vi.spyOn(schema, 'safeParse');
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform(new Array(10_001).fill(null))).toThrow('doğrulama sınırını');
    expect(parse).not.toHaveBeenCalled();
  });

  it('preserves supported bulk ID and calendar import sizes', () => {
    const ids = new Array(10_000).fill('11111111-1111-4111-8111-111111111111');
    expect(new ZodValidationPipe(z.array(z.string().uuid()).max(10_000)).transform(ids)).toEqual(ids);
    const events = Array.from({ length: 5_000 }, () => ({ title: 'Takvim', metadata: { source: 'device' } }));
    const schema = z.array(z.object({ title: z.string(), metadata: z.object({ source: z.string() }) })).max(5_000);
    expect(new ZodValidationPipe(schema).transform(events)).toEqual(events);
  });

  it('rejects excessive nesting and total nested collection sizes', () => {
    const schema = z.unknown();
    let deep: unknown = 'value';
    for (let count = 0; count < 65; count++) deep = { value: deep };
    expect(() => new ZodValidationPipe(schema).transform(deep)).toThrow('doğrulama sınırını');
    const broad = Array.from({ length: 30 }, () => new Array(10_000).fill(null));
    expect(() => new ZodValidationPipe(schema).transform(broad)).toThrow('doğrulama sınırını');
  });
});
