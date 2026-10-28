import { beforeEach, describe, expect, it, vi } from 'vitest';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./apiClient', () => ({ api: { get }, ApiError: class ApiError extends Error {} }));
import { metaService } from './meta-service';

beforeEach(() => get.mockReset());

describe('complete Meta read datasets', () => {
  it('includes insights beyond the first hundred in campaign totals', async () => {
    const first = Array.from({ length: 100 }, (_, id) => ({ id, spend: '1.25', impressions: 2, leads: 1 }));
    get.mockResolvedValueOnce(first).mockResolvedValueOnce([{ spend: '8', impressions: 5, leads: 3 }]);
    const result = await metaService.insights({ page: 1, pageSize: 100, connectionId: 'c', from: '2026-10-01', to: '2026-10-28' });
    expect(result.items).toHaveLength(101);
    expect(result.items.reduce((sum, item) => sum + item.spendMinor, 0)).toBe(13300);
    expect(result).toMatchObject({ total: 101, hasNext: false });
    const second = new URL(get.mock.calls[1][0], 'https://example.test');
    expect(Object.fromEntries(second.searchParams)).toEqual({ page: '2', pageSize: '100', connectionId: 'c', from: '2026-10-01', to: '2026-10-28' });
  });

  it('loads older messages before reversing history and safely encodes conversation ids', async () => {
    const newest = Array.from({ length: 100 }, (_, i) => ({ id: `recent-${i}`, text: `text-${i}` }));
    get.mockResolvedValueOnce(newest).mockResolvedValueOnce([{ id: 'oldest', text: 'old text' }]);
    const messages = await metaService.messages('user/id', { connectionId: 'c' });
    expect(messages).toHaveLength(101);
    expect(messages[0]).toMatchObject({ id: 'oldest', body: 'old text' });
    expect(messages.at(-1)?.id).toBe('recent-0');
    expect(get.mock.calls[1][0]).toBe('/meta/conversations/user%2Fid/messages?connectionId=c&page=2&pageSize=100');
  });

  it('checks the next page after an exact full page', async () => {
    get.mockResolvedValueOnce(Array.from({ length: 100 }, (_, id) => ({ id }))).mockResolvedValueOnce([]);
    expect(await metaService.messages('id', { connectionId: 'c' })).toHaveLength(100);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('propagates later-page failure instead of returning incomplete totals', async () => {
    get.mockResolvedValueOnce(Array.from({ length: 100 }, (_, id) => ({ id }))).mockRejectedValueOnce(new Error('offline'));
    await expect(metaService.insights({ from: '2026-10-01', to: '2026-10-28' })).rejects.toThrow('offline');
  });

  it('rejects repeated pages rather than duplicating history indefinitely', async () => {
    get.mockResolvedValue(Array.from({ length: 100 }, (_, id) => ({ id })));
    await expect(metaService.messages('id', { connectionId: 'c' })).rejects.toThrow('tekrarlandı');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed read payloads', async () => {
    get.mockResolvedValue({ data: [] });
    await expect(metaService.insights({})).rejects.toThrow('doğrulanamadı');
  });
});

describe('Meta overview source metrics', () => {
  it('passes dates to recent leads and retains missing aggregates as unavailable', async () => {
    get.mockResolvedValueOnce({ leads: 0, totalSpend: null }).mockResolvedValueOnce([]).mockResolvedValueOnce({ data: [], meta: { total: 0 } });
    const result = await metaService.overview({ from: '2026-10-01', to: '2026-10-28', connectionId: 'c' });
    expect(result.summary).toMatchObject({ leads: 0, spendMinor: null, qualifiedLeads: null, conversions: null, firstResponseMinutes: null, qualificationRate: null });
    const recent = new URL(get.mock.calls[2][0], 'https://example.test');
    expect(recent.searchParams.get('from')).toBe('2026-10-01');
    expect(recent.searchParams.get('to')).toBe('2026-10-28');
  });
  it('normalizes only aggregates returned by the backend', async () => {
    get.mockResolvedValueOnce({ leads: 4, totalSpend: 12.5, currency: 'USD', qualifiedLeads: 2, conversions: 1, qualificationRate: 50, conversionRate: 25, costPerLeadMinor: 313 }).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await metaService.overview();
    expect(result.summary).toMatchObject({ leads: 4, spendMinor: 1250, currency: 'USD', qualifiedLeads: 2, conversions: 1, qualificationRate: 50, conversionRate: 25, costPerLeadMinor: 313 });
  });
});

describe('Meta monetary metric availability', () => {
  it('keeps absent campaign performance unavailable and does not sum mixed/unknown currencies', async () => {
    const { summarizeMetaInsights } = await import('./meta-service');
    get.mockResolvedValueOnce({ data: [{ id: 'campaign' }] });
    const campaigns = await metaService.campaigns({ connectionId: 'c' });
    expect(campaigns.items[0]).toMatchObject({ spendMinor: null, qualifiedLeads: null, conversions: null });
    const item = { date: '2026-10-28', spendMinor: 100, impressions: 1, clicks: 1, leads: 1, currency: 'TRY' };
    expect(summarizeMetaInsights([item, { ...item, currency: 'USD' }]).spendMinor).toBeNull();
    expect(summarizeMetaInsights([{ ...item, currency: '' }]).spendMinor).toBeNull();
    expect(summarizeMetaInsights([{ ...item, currency: 'USD' }])).toMatchObject({ currency: 'USD', spendMinor: 100 });
  });
});
