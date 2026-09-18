import { describe, expect, it } from 'vitest';
import { opportunityCreateSchema, opportunityUpdateSchema } from '@haksan/shared';

describe('opportunity inline field update contract', () => {
  it('preserves explicit nulls so description and closing date can be cleared', () => {
    expect(opportunityUpdateSchema.parse({ description: null, expectedCloseDate: null })).toEqual({
      description: null,
      expectedCloseDate: null,
    });
  });

  it('does not add omitted fields or clear the other field in a partial update', () => {
    expect(opportunityUpdateSchema.parse({})).toEqual({});
    expect(opportunityUpdateSchema.parse({ description: null })).toEqual({ description: null });
    expect(opportunityUpdateSchema.parse({ expectedCloseDate: null })).toEqual({ expectedCloseDate: null });
  });

  it.each(['2026-09-30', '2026-09-30T12:00:00.000Z', new Date('2026-09-30T12:00:00.000Z')])(
    'retains date coercion for a valid date: %s', (value) => {
      expect(opportunityUpdateSchema.parse({ expectedCloseDate: value }).expectedCloseDate).toEqual(new Date(value));
    },
  );

  it.each(['', 'not-a-date', '2026-13-30', new Date('invalid')])(
    'rejects an invalid closing date: %s', (value) => {
      expect(opportunityUpdateSchema.safeParse({ expectedCloseDate: value }).success).toBe(false);
    },
  );

  it('preserves the description length limit and accepts empty text', () => {
    expect(opportunityUpdateSchema.parse({ description: '' }).description).toBe('');
    expect(opportunityUpdateSchema.parse({ description: 'x'.repeat(4000) }).description).toHaveLength(4000);
    expect(opportunityUpdateSchema.safeParse({ description: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('does not relax the create description contract', () => {
    expect(opportunityCreateSchema.safeParse({ title: 'CNC fırsatı', leadContactName: 'Ayşe', description: null }).success).toBe(false);
    expect(opportunityCreateSchema.safeParse({ title: 'CNC fırsatı', leadContactName: 'Ayşe', description: 'İhtiyaç notu' }).success).toBe(true);
  });
});
