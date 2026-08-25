import { describe, expect, it } from 'vitest';
import { buildQualificationStageSummary, buildSalesPerformance, DASHBOARD_QUALIFICATION_STAGES } from './chartAggregates';
import type { SalesCase } from './mock';

describe('dashboard qualification summary', () => {
  it('uses the C → WIN flow and excludes lead/lost cards', () => {
    const rows = buildQualificationStageSummary([
      { qualificationStage: 'lead' },
      { qualificationStage: 'c' },
      { qualificationStage: 'b' },
      { qualificationStage: 'b' },
      { qualificationStage: 'a' },
      { qualificationStage: 'a_plus' },
      { qualificationStage: 'win' },
      { qualificationStage: 'lost' },
    ]);

    expect(DASHBOARD_QUALIFICATION_STAGES).toEqual(['c', 'b', 'a', 'a_plus', 'win']);
    expect(rows).toEqual([
      { stage: 'c', count: 1 },
      { stage: 'b', count: 2 },
      { stage: 'a', count: 1 },
      { stage: 'a_plus', count: 1 },
      { stage: 'win', count: 1 },
    ]);
  });
});

describe('buildSalesPerformance', () => {
  const usd = (amount: number, currency: string) => (currency === 'EUR' ? amount * 1.1 : amount);
  const salesCase = (over: Partial<SalesCase>): SalesCase =>
    ({
      id: over.id ?? 'x',
      customerId: 'c1',
      assignedUserId: 'u1',
      department: 'Satış',
      requestedProduct: 'CNC',
      requestedModel: 'M1',
      quantity: 1,
      estimatedAmount: 0,
      currency: 'USD',
      stage: 'sales',
      qualificationStage: 'c',
      isOfferPrepared: false,
      isLost: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...over,
    }) as SalesCase;

  it('kazanma oranını yalnız karara bağlanmış kartlardan hesaplar', () => {
    const result = buildSalesPerformance(
      [
        salesCase({ id: '1', stage: 'Completed', closedAt: '2026-01-11T00:00:00.000Z' }),
        salesCase({ id: '2', stage: 'Completed', closedAt: '2026-01-21T00:00:00.000Z' }),
        salesCase({ id: '3', isLost: true }),
        salesCase({ id: '4', stage: 'sales', estimatedAmount: 100 }),
      ],
      usd,
    );

    expect(result.wonCount).toBe(2);
    expect(result.lostCount).toBe(1);
    expect(result.openCount).toBe(1);
    // 2 kazanılan / 3 karar = %67; açık kart paydaya girmez.
    expect(result.winRate).toBe(67);
    // 10 ve 20 günlük döngülerin ortalaması.
    expect(result.avgCycleDays).toBe(15);
  });

  it('karar verilmiş kart yokken oranı sıfır değil null döner', () => {
    const result = buildSalesPerformance([salesCase({ id: '1', stage: 'sales' })], usd);
    expect(result.winRate).toBeNull();
    expect(result.avgCycleDays).toBeNull();
    expect(result.velocityPerDay).toBeNull();
  });

  it('açık fırsat değerini para birimi çevirisiyle toplar', () => {
    const result = buildSalesPerformance(
      [
        salesCase({ id: '1', stage: 'sales', estimatedAmount: 100, currency: 'EUR' }),
        salesCase({ id: '2', stage: 'sales', estimatedAmount: 100, currency: 'USD' }),
        // Lead kartları henüz pipeline sayılmaz.
        salesCase({ id: '3', stage: 'sales', qualificationStage: 'lead', estimatedAmount: 999 }),
      ],
      usd,
    );

    expect(result.openCount).toBe(2);
    expect(result.openValue).toBeCloseTo(210);
    expect(result.avgDealValue).toBeCloseTo(105);
  });

  it('pipeline hızını kazanma oranı ve döngü süresinden türetir', () => {
    const result = buildSalesPerformance(
      [
        salesCase({ id: '1', stage: 'Completed', closedAt: '2026-01-11T00:00:00.000Z' }),
        salesCase({ id: '2', isLost: true }),
        salesCase({ id: '3', stage: 'sales', estimatedAmount: 1000 }),
        salesCase({ id: '4', stage: 'sales', estimatedAmount: 1000 }),
      ],
      usd,
    );

    // 2 açık × 1000 ort. × %50 kazanma / 10 gün = günde 100.
    expect(result.velocityPerDay).toBeCloseTo(100);
  });
});
