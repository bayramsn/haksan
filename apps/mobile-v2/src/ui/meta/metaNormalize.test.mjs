import test from 'node:test';
import assert from 'node:assert/strict';
import {
  flattenComments,
  formatMetaMoney,
  insightTotals,
  isSafeAuthorizationUrl,
  metaDateRange,
  metaStatusTone,
  normalizeCampaign,
  normalizeConnectionStatus,
  normalizeConversation,
  normalizeConversionEvent,
  normalizeInsight,
  normalizeLead,
  normalizeLeadStatus,
  normalizeMapping,
  normalizeMessages,
  normalizePage,
  parseDecimal,
  parseIds,
  tokenExpired,
} from './metaNormalize.ts';

const now = new Date('2026-05-10T09:00:00Z');

test('page envelope normalization matches web', () => {
  const fromArray = normalizePage([1, 2, 3], 2, 3);
  assert.deepEqual(fromArray, { items: [1, 2, 3], total: 7, page: 2, pageSize: 3, hasNext: true });
  const fromMeta = normalizePage({ data: [1], meta: { total: 30, page: 1, pageSize: 25 } }, 1, 25);
  assert.equal(fromMeta.hasNext, true);
  assert.equal(normalizePage({ items: [1], total: 1 }).hasNext, false);
});

test('lead status precedence', () => {
  assert.equal(normalizeLeadStatus({ qualificationStage: 'WIN' }), 'converted');
  assert.equal(normalizeLeadStatus({ leadFollowUpStatus: 'disqualified' }), 'rejected');
  assert.equal(normalizeLeadStatus({ qualificationStage: 'a+' }), 'qualified');
  assert.equal(normalizeLeadStatus({ firstContactAt: '2026-01-01' }), 'contacted');
  assert.equal(normalizeLeadStatus({ ownerUserId: 'u1' }), 'assigned');
  assert.equal(normalizeLeadStatus({}), 'new');
});

test('lead fields come from opportunity and external metadata', () => {
  const lead = normalizeLead({ id: 'o1', externalKey: 'ext', title: 'Fırsat', leadPhone: ' ', externalMetadata: { source: 'instagram', campaignName: 'Bahar' } }, now);
  assert.equal(lead.opportunityId, 'o1');
  assert.equal(lead.platform, 'instagram');
  assert.equal(lead.fullName, 'Fırsat');
  assert.equal(lead.phone, null);
  assert.equal(lead.campaignName, 'Bahar');
  assert.equal(normalizeLead({}, now).fullName, 'İsimsiz lead');
});

test('connection status and mapping defaults', () => {
  assert.equal(normalizeConnectionStatus('expired'), 'error');
  assert.equal(normalizeConnectionStatus('paused'), 'disabled');
  const mapping = normalizeMapping({ id: 'm', connectionId: 'c', formId: 'f', formName: 'F', enabled: false, fieldMap: { a: 'b' } });
  assert.equal(mapping.isActive, false);
  assert.deepEqual(mapping.fieldMappings, { a: 'b' });
  assert.equal(normalizeMapping({ id: 'm', connectionId: 'c', formId: 'f', formName: 'F' }).isActive, true);
});

test('campaign budget accepts Graph snake_case and CRM camelCase', () => {
  assert.equal(normalizeCampaign({ id: '1', daily_budget: '5000' }, 'c').dailyBudgetMinor, 5000);
  assert.equal(normalizeCampaign({ id: '1', dailyBudgetMinor: 100 }, 'c').dailyBudgetMinor, 100);
  const empty = normalizeCampaign({}, 'c');
  assert.equal(empty.dailyBudgetMinor, null);
  assert.equal(empty.status, 'PAUSED');
  assert.equal(empty.currency, 'TRY');
});

test('insights convert spend to minor units and total up', () => {
  const rows = [
    normalizeInsight({ spend: '12.5', impressions: 10, clicks: 2, leads: 1, rawMetrics: { account_currency: 'USD' } }),
    normalizeInsight({ spend: 1, impressions: 5 }),
  ];
  assert.equal(rows[0].spendMinor, 1250);
  const totals = insightTotals(rows);
  assert.equal(totals.spendMinor, 1350);
  assert.equal(totals.impressions, 15);
  assert.equal(totals.currency, 'USD');
});

test('conversation, messages and comments', () => {
  const conversation = normalizeConversation({ conversationExternalId: 't1', channel: 'whatsapp', messageCount: 3 }, 'c1', now);
  assert.equal(conversation.preview, '3 mesaj');
  assert.equal(conversation.connectionId, 'c1');
  const messages = normalizeMessages([{ id: '2', text: 'b', direction: 'outbound' }, { id: '1', text: 'a' }], now);
  assert.deepEqual(messages.map((m) => m.id), ['1', '2']);
  assert.equal(messages[1].direction, 'outbound');
  const comments = flattenComments([{ caption: 'Post', comments: { data: [{ id: 'k', username: 'ali', text: 'Merhaba', hidden: true }, { id: 'l', from: { name: 'Veli' }, message: 'Selam' }] } }, { caption: 'Boş' }], 'c1', now);
  assert.equal(comments.length, 2);
  assert.equal(comments[0].platform, 'instagram');
  assert.equal(comments[0].isHidden, true);
  assert.equal(comments[1].authorName, 'Veli');
  assert.equal(comments[1].postName, 'Post');
});

test('conversion event value comes from payload custom_data', () => {
  const event = normalizeConversionEvent({ id: 'e', payload: { custom_data: { value: 99.9, currency: 'EUR' } }, attemptCount: 2 }, now);
  assert.equal(event.valueMinor, 9990);
  assert.equal(event.currency, 'EUR');
  assert.equal(event.retryCount, 2);
  assert.equal(normalizeConversionEvent({ id: 'e' }, now).valueMinor, null);
});

test('helpers: ids, decimals, tones, token expiry, oauth url, date range', () => {
  assert.deepEqual(parseIds('a, b\nb;c  '), ['a', 'b', 'c']);
  assert.equal(parseDecimal('1.250,50'), 1250.5);
  assert.equal(parseDecimal('12.5'), 12.5);
  assert.ok(Number.isNaN(parseDecimal('')));
  assert.equal(metaStatusTone('ACTIVE'), 'success');
  assert.equal(metaStatusTone('failed'), 'destructive');
  assert.equal(metaStatusTone('new'), 'stage');
  assert.equal(tokenExpired('2026-05-01T00:00:00Z', now), true);
  assert.equal(tokenExpired(null, now), false);
  assert.equal(isSafeAuthorizationUrl('https://www.facebook.com/v19.0/dialog/oauth?x=1'), true);
  assert.equal(isSafeAuthorizationUrl('http://www.facebook.com/x'), false);
  assert.equal(isSafeAuthorizationUrl('https://evil.example/facebook.com'), false);
  assert.deepEqual(metaDateRange(30, now), { from: '2026-04-11', to: '2026-05-10' });
  assert.match(formatMetaMoney(12345, 'TRY'), /123,45/);
});
