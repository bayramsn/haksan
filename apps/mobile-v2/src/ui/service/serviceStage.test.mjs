import assert from 'node:assert/strict';
import test from 'node:test';
import {
  columnOf,
  columnStats,
  elapsedSeconds,
  filterTickets,
  historyMatches,
  formatElapsed,
  isDetailTabEnabled,
  isPartOperation,
  locationLabel,
  makeHistoryItem,
  moveTarget,
  operationsTotal,
  readHistory,
  readOperations,
  readTimer,
  serviceFee,
  serviceStageOf,
  ticketKpis,
  timerPatch,
} from './serviceStage.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 86_400_000).toISOString();

test('aşama metadata yoksa durum kodundan türetilir', () => {
  assert.equal(serviceStageOf({ metadata: { serviceStage: 'Quote Sent' }, status: { code: 'open' } }), 'Quote Sent');
  assert.equal(serviceStageOf({ metadata: { serviceStage: 'bilinmeyen' }, status: { code: 'closed' } }), 'Closed');
  assert.equal(serviceStageOf({ metadata: null, status: { code: 'resolved' } }), 'Service Completed');
  assert.equal(serviceStageOf({ metadata: null, status: { code: 'in_progress' } }), 'Diagnosis');
  assert.equal(serviceStageOf({ metadata: null, status: null }), 'Request Opened');
});

test('kanban taşıma web moveToColumn kuralını izler', () => {
  assert.equal(columnOf('Approval'), 'Servis Teklifi');
  assert.deepEqual(moveTarget('Servis Teklifi', 'Diagnosis'), { statusCode: 'in_progress', serviceStage: 'Quote Sent' });
  assert.deepEqual(moveTarget('Servis Talep', 'Diagnosis'), { statusCode: 'open', serviceStage: 'Request Opened' });
  assert.deepEqual(moveTarget('Servis Tamamlandı Formu', 'Scheduled'), {
    statusCode: 'resolved',
    serviceStage: 'Service Completed',
  });
  assert.equal(moveTarget('Servis Tamamlandı Formu', 'Signed Form'), null);
  assert.equal(moveTarget('Müşteri İletişim', 'Diagnosis'), null);
});

test('detay sekmeleri aşamaya göre açılır', () => {
  assert.equal(isDetailTabEnabled('Diagnosis', 'completion'), false);
  assert.equal(isDetailTabEnabled('Service In Progress', 'completion'), true);
  assert.equal(isDetailTabEnabled('Service In Progress', 'operations'), false);
  assert.equal(isDetailTabEnabled('Closed', 'operations'), true);
});

test('KPI ve SLA hesapları', () => {
  const tickets = [
    { severity: 'critical', reportedAt: daysAgo(3), assignedToUserId: 'u1', metadata: null, status: { code: 'open' } },
    { severity: 'low', reportedAt: daysAgo(3), assignedToUserId: null, metadata: null, status: { code: 'open' } },
    { severity: 'high', reportedAt: daysAgo(10), assignedToUserId: null, metadata: { serviceStage: 'Closed' }, status: null },
  ];
  assert.deepEqual(ticketKpis(tickets, NOW), { open: 2, urgent: 2, slaOverdue: 1, assigned: 1, total: 3 });
  assert.deepEqual(columnStats(tickets.slice(0, 2), NOW), { avgAgeDays: 3, slaOverdue: 1 });
  assert.deepEqual(columnStats([], NOW), { avgAgeDays: 0, slaOverdue: 0 });
});

test('istemci filtreleri tip, kaynak ve garanti durumuna göre süzer', () => {
  const rows = [
    { id: 'a', ticketType: 'complaint', source: 'qr', warrantyClaim: null },
    { id: 'b', ticketType: 'warranty_claim', source: '', warrantyClaim: null },
    { id: 'c', ticketType: 'request', source: 'phone', warrantyClaim: { status: 'approved' } },
  ];
  assert.deepEqual(filterTickets(rows, { source: 'manual' }).map((r) => r.id), ['b']);
  assert.deepEqual(filterTickets(rows, { warranty: 'draft' }).map((r) => r.id), ['b']);
  assert.deepEqual(filterTickets(rows, { warranty: 'approved', ticketType: 'request' }).map((r) => r.id), ['c']);
  assert.equal(filterTickets(rows, {}).length, 3);
});

test('konum etiketi gerçek veriden gelir, yoksa gizlenir', () => {
  assert.equal(locationLabel({ district: 'Kadıköy', province: 'İstanbul' }), 'Kadıköy, İstanbul');
  assert.equal(locationLabel({ district: ' ', province: 'Bursa' }), 'Bursa');
  assert.equal(locationLabel({ district: null, province: null }), null);
  assert.equal(locationLabel(undefined), null);
});

test('metadata geçmiş ve işlem okuyucuları bozuk kayıtları atar', () => {
  const metadata = {
    noteHistory: [{ id: 'n1', text: 'Not', createdAt: '2026-10-01 10:00' }, { foo: 1 }, null],
    operations: [{ id: 'srv-part-1', description: 'Parça kullanımı: Mil', quantity: '2', unitPrice: 0, currency: 'USD' }, { id: 'x' }],
  };
  assert.deepEqual(readHistory(metadata, 'noteHistory'), [{ id: 'n1', text: 'Not', createdAt: '2026-10-01 10:00', byUserId: undefined }]);
  const ops = readOperations(metadata);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].quantity, 2);
  assert.equal(isPartOperation(ops[0]), true);
  assert.equal(isPartOperation({ id: 'srv-op-1', description: 'İşçilik', quantity: 1, unitPrice: 1, currency: 'USD' }), false);
  assert.deepEqual(readHistory(null, 'activityHistory'), []);
});

test('sayaç, ücret ve toplamlar web formülüyle aynı', () => {
  const running = readTimer({ timerStatus: 'running', timerStartedAt: new Date(NOW - 90_000).toISOString(), timerElapsedSeconds: 30 });
  assert.equal(elapsedSeconds(running, NOW), 120);
  assert.equal(formatElapsed(3725), '01:02:05');
  assert.deepEqual(timerPatch('pause', running, new Date(NOW)), { timerStatus: 'paused', timerStartedAt: null, timerElapsedSeconds: 120 });
  assert.equal(timerPatch('start', readTimer({}), new Date(NOW)).timerStatus, 'running');
  assert.equal(readTimer(undefined).status, 'idle');
  assert.equal(serviceFee(1800, 120), 60);
  assert.equal(
    operationsTotal(
      [
        { id: '1', description: 'a', quantity: 2, unitPrice: 10, currency: 'USD' },
        { id: '2', description: 'b', quantity: 1, unitPrice: 99, currency: 'EUR' },
      ],
      'USD',
    ),
    20,
  );
  assert.deepEqual(makeHistoryItem('srv-note', 'Merhaba', new Date(NOW), 'u1'), {
    id: `srv-note-${NOW}`,
    text: 'Merhaba',
    createdAt: '2026-10-15 12:00',
    byUserId: 'u1',
  });
});

test('servis geçmişi araması form no, makine ve notları kapsar', () => {
  const ticket = {
    ticketNo: 'CNC-SRV-0042',
    subject: 'Spindle arızası',
    description: null,
    resolutionNote: null,
    company: { legalTitle: 'Örnek Makina A.Ş.', shortName: 'Örnek' },
    metadata: {
      completionForm: { formNo: 'SF-778', tezgah: { marka: 'Haksan', seriNo: 'HX-9001' } },
      noteHistory: [{ id: 'n1', text: 'Rulman değişti', createdAt: '2026-10-15 12:00' }],
    },
  };
  assert.equal(historyMatches(ticket, 'sf-778'), true);
  assert.equal(historyMatches(ticket, 'hx-9001'), true);
  assert.equal(historyMatches(ticket, 'RULMAN'), true);
  assert.equal(historyMatches(ticket, 'örnek'), true);
  assert.equal(historyMatches(ticket, 'hidrolik'), false);
  assert.equal(historyMatches(ticket, '  '), true);
});
