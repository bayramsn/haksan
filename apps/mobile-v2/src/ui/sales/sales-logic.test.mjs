import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  activityDelta,
  addressOf,
  asQualification,
  contactNameOf,
  currencyOptions,
  departmentScores,
  dominantQuoteCurrency,
  filterAndSortRows,
  focusServerQuery,
  isSalesFocus,
  matchesFocus,
  reasonStats,
  kanbanMoveOptions,
  BOARD_STAGES,
  QUALIFICATION_ORDER,
  qualificationRank,
  sortByQualification,
  cancelStageBody,
  canMarkOpportunityClosed,
  lostStageBody,
  validateCloseCaseInput,
  validateLostInput,
  monthlySales,
  moveKind,
  neighborIds,
  operationStageOptions,
  outcomeCounts,
  partyName,
  qualificationSummary,
  salesPerformance,
  teamTaskRows,
  totalsByCurrency,
  TRELLO_NO_LIST,
  trelloCommitRows,
  trelloListKey,
  trelloPendingCount,
  trelloRowKey,
  validateContactEvent,
  validateStageChange,
} from './sales-logic.ts';

const row = (patch) => ({
  id: 'x',
  title: 'Kart',
  qualificationStage: 'c',
  estimatedValue: '100',
  currency: { code: 'USD' },
  company: null,
  primaryContact: null,
  leadCompanyTitle: null,
  leadContactName: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  stage: { code: 'sales' },
  ...patch,
});

test('kanban kolonları Lead → C → B → A → A+ → WIN → LOST sırasında', () => {
  const expected = ['lead', 'c', 'b', 'a', 'a_plus', 'win', 'lost'];
  assert.deepEqual([...QUALIFICATION_ORDER], expected);
  assert.deepEqual(BOARD_STAGES, expected);
  assert.equal(asQualification('nonsense'), 'lead');
});

test('derece sıralaması tek yardımcıdan gelir', () => {
  assert.deepEqual(['win', 'a_plus', 'lost', 'a', 'b', 'c', 'lead'].map(qualificationRank), [5, 4, 6, 3, 2, 1, 0]);
  assert.equal(qualificationRank(null), 0);
  const rows = [
    { id: 1, qualificationStage: 'lost' },
    { id: 2, qualificationStage: 'a_plus' },
    { id: 3, qualificationStage: 'win' },
    { id: 4, qualificationStage: 'c' },
    { id: 5, qualificationStage: null },
    { id: 6, qualificationStage: 'a' },
    { id: 7, qualificationStage: 'b' },
    { id: 8, qualificationStage: 'c' },
  ];
  assert.deepEqual(sortByQualification(rows, (row) => row.qualificationStage).map((row) => row.id), [5, 4, 8, 7, 6, 2, 3, 1]);
  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('API tipi ve gösterge özeti aynı derece sırasını kullanır', () => {
  const endpoints = readFileSync(new URL('../../api/endpoints.ts', import.meta.url), 'utf8');
  const literal = endpoints.match(/QUALIFICATION_STAGES = \[([^\]]+)\]/)?.[1];
  assert.ok(literal, 'endpoints.ts QUALIFICATION_STAGES bulunamadı');
  assert.deepEqual(literal.split(',').map((part) => part.trim().replace(/'/g, '')), [...QUALIFICATION_ORDER]);
  assert.deepEqual(qualificationSummary([]).map((row) => row.stage), [...QUALIFICATION_ORDER]);
});

test('aşamaya taşı menüsü web kurallarıyla aynı', () => {
  assert.deepEqual(kanbanMoveOptions('win'), []);
  const fromB = kanbanMoveOptions('b').filter((option) => option.allowed).map((option) => option.target);
  assert.deepEqual(fromB, ['c', 'a', 'lost']);
  const fromLost = kanbanMoveOptions('lost').filter((option) => option.allowed).map((option) => option.target);
  assert.deepEqual(fromLost, ['lead', 'c', 'b', 'a', 'a_plus', 'win']);
  assert.equal(moveKind('b', 'c'), 'back');
  assert.equal(moveKind('b', 'a'), 'forward');
  assert.equal(moveKind('b', 'lost'), 'lost');
  assert.equal(moveKind('lost', 'b'), 'fromLost');
});

test('kart alanları için yedek metinler', () => {
  assert.equal(partyName(row({ company: { legalTitle: 'ABC A.Ş.', shortName: 'ABC' } })), 'ABC');
  assert.equal(partyName(row({ leadContactName: 'Ali' })), 'Ali');
  assert.equal(partyName(row({})), 'Firma bilgisi bekleniyor');
  assert.equal(contactNameOf(row({ primaryContact: { fullName: 'Veli' }, leadContactName: 'Ali' })), 'Veli');
  assert.equal(addressOf(row({ leadCity: 'Bursa', leadDistrict: 'Nilüfer' })), 'Nilüfer, Bursa');
  assert.equal(addressOf(row({})), 'Adres bilgisi yok');
});

test('para birimi başına toplam', () => {
  assert.deepEqual(
    totalsByCurrency([row({ estimatedValue: '100' }), row({ estimatedValue: '50.5' }), row({ estimatedValue: '10', currency: { code: 'EUR' } }), row({ estimatedValue: null })]),
    [
      { currency: 'USD', total: 150.5 },
      { currency: 'EUR', total: 10 },
    ]
  );
});

test('sonuç sayaçları, filtre ve sıralama', () => {
  const rows = [
    row({ id: '1', company: { legalTitle: 'Zeta', shortName: null }, createdAt: '2026-01-01T00:00:00Z' }),
    row({ id: '2', company: { legalTitle: 'Alfa', shortName: null }, qualificationStage: 'win', estimatedValue: '500', createdAt: '2026-02-01T00:00:00Z' }),
    row({ id: '3', company: { legalTitle: 'Beta', shortName: null }, qualificationStage: 'lost', currency: { code: 'EUR' }, createdAt: '2026-03-01T00:00:00Z' }),
  ];
  assert.deepEqual(outcomeCounts(rows), { open: 1, won: 1, lost: 1 });
  assert.deepEqual(filterAndSortRows(rows, {}, 'name').map((r) => r.id), ['2', '3', '1']);
  assert.deepEqual(filterAndSortRows(rows, {}, 'newest').map((r) => r.id), ['3', '2', '1']);
  assert.deepEqual(filterAndSortRows(rows, {}, 'value').map((r) => r.id)[0], '2');
  assert.deepEqual(filterAndSortRows(rows, { currency: 'EUR' }, 'newest').map((r) => r.id), ['3']);
  assert.deepEqual(filterAndSortRows(rows, { outcome: 'won' }, 'newest').map((r) => r.id), ['2']);
  assert.deepEqual(currencyOptions(rows), ['EUR', 'USD']);
  const withLead = [...rows, row({ id: '4', company: null, leadCompanyTitle: 'Lead AŞ' })];
  assert.deepEqual(filterAndSortRows(withLead, { companyDecision: 'pending' }, 'newest').map((r) => r.id), ['4']);
  assert.equal(filterAndSortRows(withLead, { companyDecision: 'resolved' }, 'newest').length, 3);
});

test('önceki / sonraki kart', () => {
  assert.deepEqual(neighborIds(['a', 'b', 'c'], 'b'), { previous: 'a', next: 'c' });
  assert.deepEqual(neighborIds(['a'], 'z'), { previous: null, next: null });
});

test('operasyon aşaması seçenekleri ve iptal doğrulaması', () => {
  const options = operationStageOptions('quote');
  assert.equal(options.length, 15);
  assert.equal(options.find((o) => o.current).code, 'quote');
  assert.equal(options.at(-1).code, 'cancelled');
  assert.equal(validateStageChange({ toStage: 'cancelled' }), 'İptal nedeni zorunlu.');
  assert.equal(validateStageChange({ toStage: 'cancelled', cancellationReasonCode: 'price' }), null);
});

test('temas kaydında takip tarihi aksiyon ister', () => {
  assert.match(validateContactEvent({ note: '', nextAction: ' ', hasNextActionAt: true }), /zorunludur/);
  assert.equal(validateContactEvent({ note: 'ok', nextAction: 'Ara', hasNextActionAt: true }), null);
});

test('Trello commit satırları yalnız kararı verilmiş create satırlarını taşır', () => {
  const rows = [
    { rowNumber: 1, externalReference: 'a', title: 'A', status: 'create', errors: [], warnings: [], matches: [], candidate: { companyTitle: 'A' } },
    { rowNumber: 2, externalReference: 'b', title: 'B', status: 'create', errors: [], warnings: [], matches: [], candidate: { companyTitle: 'B' } },
    { rowNumber: 3, externalReference: 'c', title: 'C', status: 'skip', errors: [], warnings: [], matches: [], candidate: { companyTitle: 'C' } },
  ];
  const decisions = { [trelloRowKey(rows[0])]: { action: 'create', createContact: true } };
  assert.equal(trelloPendingCount(rows.slice(0, 2), decisions), 1);
  const out = trelloCommitRows(rows, decisions);
  assert.equal(out.length, 1);
  assert.equal(out[0].resolution.action, 'create');
  assert.equal('matches' in out[0], false);
  assert.deepEqual(out[0].candidate, { companyTitle: 'A' });
  const key = trelloRowKey(rows[0]);
  const mapped = trelloCommitRows(rows, decisions, {
    stageByList: { [trelloListKey(rows[0])]: 'quote' },
    candidates: { [key]: { companyTitle: 'A Düzeltilmiş' } },
  });
  assert.equal(mapped[0].stageCode, 'quote');
  assert.equal(mapped[0].candidate.companyTitle, 'A Düzeltilmiş');
  assert.equal(trelloListKey({ listName: '  ' }), TRELLO_NO_LIST);
});

test('satış performansı ve kalifikasyon özeti', () => {
  const rows = [
    row({ qualificationStage: 'win', createdAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-11T00:00:00Z' }),
    row({ qualificationStage: 'lost' }),
    row({ qualificationStage: 'b', estimatedValue: '200' }),
    row({ qualificationStage: 'a', estimatedValue: '400' }),
    row({ qualificationStage: 'lead', estimatedValue: '999' }),
  ];
  const perf = salesPerformance(rows);
  assert.equal(perf.winRate, 50);
  assert.equal(perf.avgCycleDays, 10);
  assert.equal(perf.openCount, 2);
  assert.deepEqual(perf.avgDeal, { currency: 'USD', total: 300 });
  assert.deepEqual(perf.velocityPerDay, { currency: 'USD', total: 30 });
  assert.deepEqual(qualificationSummary(rows).map((r) => r.count), [1, 0, 1, 1, 0, 1, 1]);
  assert.equal(salesPerformance([row({})]).winRate, null);
});

test('aylık satış kovaları', () => {
  const now = new Date(2026, 9, 15);
  const all = { byCurrency: [{ currencyCode: 'USD', months: [{ month: '2026-10', count: 3, total: '900' }] }, { currencyCode: 'EUR', months: [{ month: '2026-10-01', count: 2, total: '50' }] }] };
  const approved = { byCurrency: [{ currencyCode: 'USD', months: [{ month: '2026-10', count: 1, total: '300' }] }] };
  const buckets = monthlySales({ all, approved, rows: [row({ qualificationStage: 'lost', createdAt: '2026-10-02T00:00:00Z' })], months: 3, revenueCurrency: 'USD', now });
  assert.deepEqual(buckets.map((b) => b.key), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(buckets[2], { key: '2026-10', label: 'Eki', quotes: 5, won: 1, lost: 1, revenue: 300 });
  assert.equal(dominantQuoteCurrency(all), 'USD');
  assert.equal(dominantQuoteCurrency(null, 'EUR'), 'EUR');
});

test('ekip görev tablosu ve aktivite değişimi', () => {
  const rows = teamTaskRows([
    { userId: '1', fullName: 'A', open: 2, overdue: 0, completed: 1 },
    { userId: '2', fullName: 'B', open: 1, overdue: 3, completed: 0 },
    { userId: '3', fullName: 'C', open: 0, overdue: 0, completed: 9 },
  ]);
  assert.deepEqual(rows.map((r) => r.userId), ['2', '1']);
  assert.deepEqual(activityDelta(5, 0), { pct: null, dir: 'up' });
  assert.deepEqual(activityDelta(0, 0), { pct: 0, dir: 'flat' });
  assert.deepEqual(activityDelta(5, 10), { pct: -50, dir: 'down' });
});

test('departman puanları paydası 0 olan ekseni ölçmez', () => {
  const scores = departmentScores({
    openOpportunities: 5, totalOpportunities: 10, approvedQuotes: 1, totalQuotes: 4,
    overdueReceivables: 1, totalReceivables: 4, openServices: 0, totalServices: 0, availableStock: 3, totalStock: 6,
  });
  assert.deepEqual(scores.map((s) => s.value), [50, 25, 75, null, 50]);
});

test('LOST geçişi zorunlu alanları ister ve opsiyonel rakip alanlarını yalnız doluysa gönderir', () => {
  const empty = { reasonCode: null, productName: '', unmetConditions: '', competitorName: '', competitorModel: '' };
  assert.match(validateLostInput(empty) ?? '', /zorunludur/);
  const filled = { reasonCode: 'price', productName: ' VM-2 ', unmetConditions: 'Teslim süresi', competitorName: '', competitorModel: ' X1 ' };
  assert.equal(validateLostInput(filled), null);
  assert.deepEqual(lostStageBody(filled), {
    toStage: 'lost',
    cancellationReasonCode: 'price',
    lostProductName: 'VM-2',
    lostUnmetConditions: 'Teslim süresi',
    lostCompetitorProductModel: 'X1',
  });
});

test('CloseCase: iptal vs kayıp doğrulama ve gövdeler', () => {
  assert.match(validateCloseCaseInput({ outcome: '', reasonCode: null, cancelNote: '', lost: emptyLost() }) ?? '', /tür/);
  assert.match(
    validateCloseCaseInput({ outcome: 'cancelled', reasonCode: null, cancelNote: '', lost: emptyLost() }) ?? '',
    /İptal nedeni/
  );
  assert.equal(
    validateCloseCaseInput({
      outcome: 'cancelled',
      reasonCode: 'cancel_no_budget',
      cancelNote: ' erteledi ',
      lost: emptyLost(),
    }),
    null
  );
  assert.deepEqual(cancelStageBody({ reasonCode: 'cancel_no_budget', note: ' erteledi ' }), {
    toStage: 'cancelled',
    outcome: 'cancelled',
    cancellationReasonCode: 'cancel_no_budget',
    changeReason: 'erteledi',
  });
  assert.match(
    validateCloseCaseInput({
      outcome: 'lost',
      reasonCode: 'price',
      cancelNote: '',
      lost: { ...emptyLost(), productName: '', unmetConditions: '' },
    }) ?? '',
    /zorunludur/
  );
  assert.equal(canMarkOpportunityClosed({ canUpdate: true, qualificationStage: 'a' }), true);
  assert.equal(canMarkOpportunityClosed({ canUpdate: true, qualificationStage: 'win' }), false);
  assert.equal(canMarkOpportunityClosed({ canUpdate: true, qualificationStage: 'a', pipelineStageCode: 'cancelled' }), false);
  assert.equal(canMarkOpportunityClosed({ canUpdate: true, closedAt: '2026-01-01', qualificationStage: 'a' }), false);
});

function emptyLost() {
  return { reasonCode: null, productName: '', unmetConditions: '', competitorName: '', competitorModel: '' };
}

test('gösterge paneli odak filtreleri', () => {
  assert.equal(isSalesFocus('no_action'), true);
  assert.equal(isSalesFocus('toString'), false);
  assert.deepEqual(focusServerQuery('won'), { qualificationStage: 'win', view: 'all' });
  assert.deepEqual(focusServerQuery('unassigned'), { qualificationStage: 'lead', view: 'active' });
  assert.equal(matchesFocus({ qualificationStage: 'lead', ownerUserId: 'u1' }, 'unassigned'), false);
  assert.equal(matchesFocus({ qualificationStage: 'lead', ownerUserId: null }, 'unassigned'), true);
  assert.equal(matchesFocus({ qualificationStage: 'win' }, 'open'), false);
  assert.equal(matchesFocus({ qualificationStage: 'lead', firstContactAt: '2026-01-01' }, 'uncontacted'), false);
});

test('kapanış / kayıp nedeni sayaçları', () => {
  const stats = reasonStats([
    { qualificationStage: 'lost', lostReason: { code: 'price', name: 'Fiyat' } },
    { qualificationStage: 'lost', lostReason: { code: 'price', name: 'Fiyat' } },
    { qualificationStage: 'win', wonReason: ' Hızlı teslim ' },
    { qualificationStage: 'win', wonReason: null },
    { qualificationStage: 'lead', lostReason: { code: 'price', name: 'Fiyat' } },
  ]);
  assert.deepEqual(stats.map((s) => [s.value, s.count, s.serverValue]), [
    ['lost:price', 2, 'price'],
    ['won:Hızlı teslim', 1, 'Hızlı teslim'],
  ]);
});
