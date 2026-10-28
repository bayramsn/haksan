import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { metaOverviewQuerySchema, metaLeadListQuerySchema } from '@haksan/shared';
import { MetaService } from '../src/modules/meta/meta.service';
import type { AuthContext } from '../src/shared/security/auth.types';
const connectionId = '30000000-0000-4000-8000-000000000001';
const actor = { tenantId: 'tenant', activeDivisionId: 'division', canViewAllDivisions: true, activeDepartmentId: null, accessScopes: [] } as unknown as AuthContext;
async function capture(insights: unknown[][] = [['TRY', '12.50', 100, 4]]) {
  const transport = vi.fn(async (request: { text: string }, _params: unknown[]) => ({ rows:
    request.text.includes('from "meta_connections"') ? [[1]] : request.text.includes('from "opportunities"') ? [[4, 2, 1]] : insights,
  }));
  const service = new MetaService(drizzle({ query: transport } as never) as never, {} as never, {} as never, {} as never);
  const result = await service.overview(actor, { connectionId, from: '2026-10-01', to: '2026-10-28' });
  return { result, calls: transport.mock.calls };
}
describe('filtered Meta overview aggregates', () => {
  it('validates real calendar dates and ordered bounds for overview and recent leads', () => {
    for (const schema of [metaOverviewQuerySchema, metaLeadListQuerySchema]) {
      expect(schema.safeParse({ from: '2026-02-30' }).success).toBe(false);
      expect(schema.safeParse({ from: '2026-10-28', to: '2026-10-01' }).success).toBe(false);
      expect(schema.safeParse({ from: '2026-10-01', to: '2026-10-28', connectionId }).success).toBe(true);
    }
  });
  it('filters tenant, connection, inclusive full days and CRM resource division before aggregation', async () => {
    const { result, calls } = await capture();
    expect(result).toMatchObject({ leads: 4, qualifiedLeads: 2, conversions: 1, totalSpend: 12.5, currency: 'TRY', impressions: 100, clicks: 4, costPerLeadMinor: 313, qualificationRate: 50, conversionRate: 25, firstResponseMinutes: null });
    const lead = calls.find(([request]) => request.text.includes('from "opportunities"'))!;
    expect(lead[1]).toEqual(['tenant', 'meta_lead_ads', 'division', connectionId, '2026-10-01T00:00:00.000Z', '2026-10-29T00:00:00.000Z']);
    expect(lead[0].text).toContain('"opportunities"."deleted_at" is null');
    expect(lead[0].text).toContain("lower(coalesce(\"lead_follow_up_status\", '')) <> 'disqualified'");
    expect(lead[0].text).toContain('"opportunities"."created_at" <');
    const insight = calls.find(([request]) => request.text.includes('from "meta_daily_insights"'))!;
    expect(insight[1]).toEqual(['tenant', connectionId, '2026-10-01T00:00:00.000Z', '2026-10-29T00:00:00.000Z']);
  });
  it('never sums different or unknown currencies and never invents missing response times', async () => {
    for (const rows of [[], [[null, '100', 1, 2]], [['TRY', '10', 1, 2], ['USD', '50', 3, 4]]]) {
      const { result } = await capture(rows);
      expect(result.totalSpend).toBeNull();
      expect(result.currency).toBeNull();
      expect(result.costPerLeadMinor).toBeNull();
      expect(result.firstResponseMinutes).toBeNull();
    }
  });
});
