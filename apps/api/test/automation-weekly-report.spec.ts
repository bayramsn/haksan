import { describe, expect, it } from 'vitest';
import { formatWeeklySalesReport } from '../src/modules/automation/automation.service';

describe('Weekly sales report', () => {
  it('formats the weekly opportunity, quote and approval summary', () => {
    const report = formatWeeklySalesReport(
      {
        createdOpportunities: 8,
        wonOpportunities: 3,
        lostOpportunities: 1,
        openPipeline: 24,
        createdQuotes: 6,
        sentQuotes: 4,
        approvedQuotes: 2,
        pendingDiscountApprovals: 2,
        activities: 17,
        overdueActions: 3,
      },
      { from: new Date('2026-07-20T00:00:00Z'), to: new Date('2026-07-27T00:00:00Z') },
    );

    expect(report).toContain('8 yeni fırsat');
    expect(report).toContain('kazanma oranı %75');
    expect(report).toContain('6 yeni teklif');
    expect(report).toContain('2 indirim onayı bekliyor');
    expect(report).toContain('3 fırsatta takip tarihi geçti');
  });
});
