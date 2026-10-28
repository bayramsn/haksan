import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { metaLeadListQuerySchema, metaListQuerySchema } from '@haksan/shared';
import { MetaService } from '../src/modules/meta/meta.service';
import type { AuthContext } from '../src/shared/security/auth.types';

const tenantId = '10000000-0000-4000-8000-000000000001';
const divisionId = '20000000-0000-4000-8000-000000000001';
const connectionId = '30000000-0000-4000-8000-000000000001';
const departmentId = '40000000-0000-4000-8000-000000000001';
const actor = {
  tenantId, canViewAllDivisions: true, activeDivisionId: divisionId,
  activeDepartmentId: departmentId, divisionIds: [],
  accessScopes: [{ resource: 'opportunities', departmentId, divisionId, isPrimary: true }],
} as unknown as AuthContext;

async function capture(queryInput: Record<string, unknown>, context = actor) {
  const transport = vi.fn(async (request: { text: string }, _params: unknown[]) => ({ rows: request.text.includes('count(*)') ? [[7]] : [] }));
  const service = new MetaService(drizzle({ query: transport } as never) as never, {} as never, {} as never, {} as never);
  const result = await service.listLeads(context, metaLeadListQuerySchema.parse(queryInput));
  const calls = transport.mock.calls.map(([request, params]) => ({ text: request.text, params }));
  return { calls, result };
}

function predicate(text: string) {
  return text.slice(text.indexOf(' where ')).split(' order by ')[0];
}

describe('Meta leads read filters', () => {
  it('validates lead-specific filters without changing other Meta list contracts', () => {
    expect(metaLeadListQuerySchema.parse({ search: '  Ahmet  ', status: 'qualified', platform: 'instagram', connectionId })).toEqual({
      page: 1, pageSize: 25, search: 'Ahmet', status: 'qualified', platform: 'instagram', connectionId,
    });
    expect(metaListQuerySchema.parse({ search: 'Ahmet', status: 'qualified' })).not.toHaveProperty('search');
    for (const input of [{ status: 'won' }, { platform: 'tiktok' }, { connectionId: 'bad-id' }, { search: 'x'.repeat(256) }, { pageSize: 101 }]) {
      expect(metaLeadListQuerySchema.safeParse(input).success).toBe(false);
    }
  });

  it('applies all filters before pagination with identical scoped count and list predicates', async () => {
    const { calls, result } = await capture({ search: "Ahmet' OR 1=1 --", status: 'contacted', platform: 'instagram', connectionId, page: 3, pageSize: 10 });
    expect(calls).toHaveLength(2);
    const list = calls.find((call) => !call.text.includes('count(*)'))!;
    const count = calls.find((call) => call.text.includes('count(*)'))!;
    expect(predicate(list.text)).toBe(predicate(count.text));
    expect(count.params).toEqual([tenantId, 'meta_lead_ads', divisionId, connectionId, 'contacted', 'instagram', ...Array(6).fill("%Ahmet' OR 1=1 --%")]);
    expect(list.params).toEqual([...count.params, 10, 20]);
    expect(list.text).not.toContain("Ahmet'");
    expect(count.text).toContain('"opportunities"."deleted_at" is null');
    expect(count.text).toContain("->>'connectionId'");
    for (const field of ['title', 'lead_contact_name', 'lead_company_title', 'lead_phone', 'lead_email']) {
      expect(count.text).toContain(`"opportunities"."${field}" ilike`);
    }
    expect(count.text).toContain("->>'campaignName' ilike");
    expect(result.meta).toEqual({ page: 3, pageSize: 10, total: 7 });
  });

  it('treats SQL wildcard characters as literal search text', async () => {
    const { calls } = await capture({ search: '100%_\\' });
    expect(calls[1].params.slice(3)).toEqual(Array(6).fill('%100\\%\\_\\\\%'));
  });

  it.each(['new', 'assigned', 'contacted', 'qualified', 'converted', 'rejected'])('filters by the displayed %s status with badge precedence', async (status) => {
    const { calls } = await capture({ status });
    const { text, params } = calls[1];
    expect(params).toEqual([tenantId, 'meta_lead_ads', divisionId, status]);
    const cases = ["then 'converted'", "then 'rejected'", "then 'qualified'", "then 'contacted'", "then 'assigned'", "else 'new'"];
    const positions = cases.map((part) => text.indexOf(part));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(text).toContain("('win', 'won', 'converted')");
    expect(text).toContain("('lost', 'rejected', 'disqualified')");
    expect(text).toContain("('a', 'a+', 'qualified')");
    expect(text).toContain('"opportunities"."first_contact_at" is not null');
  });

  it('uses the same Facebook fallback as clients for legacy webhook metadata', async () => {
    const { calls } = await capture({ platform: 'facebook' });
    expect(calls[1].text).toContain("coalesce(\"opportunities\".\"external_metadata\"->>'platform', \"opportunities\".\"external_metadata\"->>'source', 'facebook')");
    expect(calls[1].params).toEqual([tenantId, 'meta_lead_ads', divisionId, 'facebook']);
  });

  it('denies all rows when the active department has no opportunity scope', async () => {
    const { calls } = await capture({ connectionId }, { ...actor, activeDepartmentId: 'different-department' });
    for (const call of calls) {
      expect(call.text).toContain('1 = 0');
      expect(call.params).toEqual([tenantId, 'meta_lead_ads', connectionId, ...(call.text.includes('count(*)') ? [] : [25])]);
    }
  });
});
