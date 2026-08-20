import { describe, expect, it } from 'vitest';
import {
  LEAD_AUTHORITY_STATUSES,
  LEAD_BUDGET_STATUSES,
  LEAD_PURCHASE_TIMEFRAMES,
  LEAD_TECHNICAL_FITS,
  calculateLeadInsights,
} from '@haksan/shared';

const now = new Date('2026-07-31T12:00:00.000Z');

describe('Lead Workspace V2 insights', () => {
  it('calculates a fully qualified and fully engaged lead as 100', () => {
    const result = calculateLeadInsights({
      requestedProduct: '5 eksen CNC',
      requestedMachine: 'HAXAN MMT 1170',
      leadNeedSummary: 'Havacılık parçası için 5 eksen kapasite yatırımı',
      leadAuthorityStatus: 'decision_maker',
      leadBudgetStatus: 'approved',
      leadPurchaseTimeframe: 'immediate',
      leadTechnicalFit: 'fit',
      leadFollowUpStatus: 'contacted',
      createdAt: new Date('2026-07-31T08:00:00.000Z'),
      firstContactAt: new Date('2026-07-31T09:00:00.000Z'),
      leadSlaHours: 4,
      nextAction: 'Demo planla',
      nextActionAt: new Date('2026-08-01T09:00:00.000Z'),
      latestActivityAt: new Date('2026-07-31T10:00:00.000Z'),
      latestContactOutcome: 'meeting_booked',
      now,
    });

    expect(result).toMatchObject({
      fitScore: 100,
      engagementScore: 100,
      priorityScore: 100,
      priorityBand: 'high',
      softBlockers: [],
      recommendedAction: 'Fırsata dönüştürmeye hazır',
    });
    expect(result.factors).toHaveLength(5);
    expect(result.factors.every((factor) => factor.score === 20 && factor.complete)).toBe(true);
  });

  it('keeps empty qualification explainable and low priority', () => {
    const result = calculateLeadInsights({
      leadFollowUpStatus: 'new',
      createdAt: now,
      now,
    });

    expect(result.fitScore).toBe(0);
    expect(result.engagementScore).toBe(0);
    expect(result.priorityScore).toBe(0);
    expect(result.priorityBand).toBe('low');
    expect(result.softBlockers).toEqual([
      'İhtiyaç tamamlanmadı',
      'Karar verici tamamlanmadı',
      'Bütçe tamamlanmadı',
      'Zamanlama tamamlanmadı',
      'Teknik uyum tamamlanmadı',
    ]);
  });

  it('validates every enum branch without producing out-of-range scores', () => {
    for (const authority of LEAD_AUTHORITY_STATUSES) {
      for (const budget of LEAD_BUDGET_STATUSES) {
        for (const timeframe of LEAD_PURCHASE_TIMEFRAMES) {
          for (const technical of LEAD_TECHNICAL_FITS) {
            const result = calculateLeadInsights({
              requestedProduct: 'CNC',
              leadNeedSummary: 'Yeni kapasite',
              leadAuthorityStatus: authority,
              leadBudgetStatus: budget,
              leadPurchaseTimeframe: timeframe,
              leadTechnicalFit: technical,
              now,
            });
            expect(result.fitScore).toBeGreaterThanOrEqual(0);
            expect(result.fitScore).toBeLessThanOrEqual(100);
            expect(result.priorityScore).toBeGreaterThanOrEqual(0);
            expect(result.priorityScore).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it('uses the documented 70/30 weighting and band boundaries', () => {
    const medium = calculateLeadInsights({
      requestedProduct: 'CNC',
      leadNeedSummary: 'Kapasite',
      leadAuthorityStatus: 'committee',
      leadBudgetStatus: 'estimated',
      leadPurchaseTimeframe: 'three_to_six_months',
      leadTechnicalFit: 'needs_review',
      leadFollowUpStatus: 'contacted',
      latestActivityAt: now,
      now,
    });
    expect(medium.priorityScore).toBe(Math.round(medium.fitScore * 0.7 + medium.engagementScore * 0.3));
    expect(medium.priorityBand).toBe('medium');

    const low = calculateLeadInsights({
      requestedProduct: 'CNC',
      leadNeedSummary: 'Kapasite',
      leadAuthorityStatus: 'influencer',
      now,
    });
    expect(low.priorityScore).toBeLessThan(50);
    expect(low.priorityBand).toBe('low');
  });

  it('scores a dated future action but not an overdue action', () => {
    const base = {
      requestedProduct: 'CNC',
      leadNeedSummary: 'Kapasite',
      nextAction: 'Ara',
      now,
    };
    const future = calculateLeadInsights({ ...base, nextActionAt: new Date('2026-08-01T12:00:00.000Z') });
    const overdue = calculateLeadInsights({ ...base, nextActionAt: new Date('2026-07-30T12:00:00.000Z') });

    expect(future.engagementScore - overdue.engagementScore).toBe(20);
    expect(overdue.recommendedAction).toBe('Geciken aksiyonu yeniden planlayın');
  });

  it('awards SLA points only for a first contact inside the SLA window', () => {
    const base = {
      createdAt: new Date('2026-07-31T06:00:00.000Z'),
      leadSlaHours: 4,
      now,
    };
    const withinSla = calculateLeadInsights({
      ...base,
      firstContactAt: new Date('2026-07-31T09:59:59.000Z'),
    });
    const boundary = calculateLeadInsights({
      ...base,
      firstContactAt: new Date('2026-07-31T10:00:00.000Z'),
    });
    const breached = calculateLeadInsights({
      ...base,
      firstContactAt: new Date('2026-07-31T10:00:01.000Z'),
    });

    expect(withinSla.engagementScore).toBe(20);
    expect(boundary.engagementScore).toBe(20);
    expect(breached.engagementScore).toBe(0);
  });
});
