import { describe, expect, it } from 'vitest';
import { opportunityQualificationChangeSchema } from '@haksan/shared';

describe('opportunity lost detail contract', () => {
  it('accepts bounded product and unmet-condition snapshots', () => {
    const result = opportunityQualificationChangeSchema.safeParse({
      toStage: 'lost',
      cancellationReasonCode: 'competitor',
      lostProductName: 'HAXAN MMT-1170',
      lostUnmetConditions: 'Teslim süresi ve ödeme planı uygun bulunmadı.',
      lostCompetitorId: '00000000-0000-4000-8000-000000000001',
      lostCompetitorProductModel: 'Rakip Model 500',
    });

    expect(result.success).toBe(true);
  });

  it('rejects unbounded lost-condition text', () => {
    const result = opportunityQualificationChangeSchema.safeParse({
      toStage: 'lost',
      cancellationReasonCode: 'other',
      lostUnmetConditions: 'x'.repeat(2001),
    });

    expect(result.success).toBe(false);
  });
});
