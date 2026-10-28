import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompanyQuery,
  companyVisibility,
  isCompanyVisible,
  sortModeToQuery,
  visibleFirmTypes,
  supplierCategoryLabel,
  validateImportFile,
} from './company-logic.ts';
import {
  canManageGroup,
  canSearchMessages,
  groupConversations,
  isSeenByOther,
  memberSubtitle,
  conversationDisplayName,
  normalizeAttachment,
  parseRefCard,
  refCardRoute,
} from './chat-logic.ts';
import {
  activeTaskFilterCount,
  buildCompletionPatch,
  canDeleteTask,
  taskRelatedLinks,
  taskSortDir,
} from './task-logic.ts';
import {
  calendarRange,
  calendarSourceLabel,
  canEditCalendarEvent,
  daysInRange,
  defaultEventWindow,
  isCalendarFileName,
  listSections,
  moveCursor,
  startOfWeek,
  validateEventDraft,
} from './calendar-logic.ts';

test('firma sıralama modları web ile aynı sorguya dönüşür', () => {
  assert.deepEqual(sortModeToQuery('default'), { sortBy: 'createdAt', sortDir: 'desc' });
  assert.deepEqual(sortModeToQuery('name_asc'), { sortBy: 'name', sortDir: 'asc' });
  assert.deepEqual(sortModeToQuery('name_desc'), { sortBy: 'name', sortDir: 'desc' });
  assert.deepEqual(sortModeToQuery('created_asc'), { sortBy: 'createdAt', sortDir: 'asc' });
});

test('firma sorgusu yalnız seçili filtreleri taşır', () => {
  assert.deepEqual(
    buildCompanyQuery({ search: ' abc ', tab: 'supplier', salesTab: 'active_customer', divisionId: 'd1', supplierCategory: 'logistics', sortMode: 'name_asc' }),
    { search: 'abc', relationTypeCode: 'supplier', customerStatusCode: 'active', divisionId: 'd1', supplierCategoryCode: 'logistics', sortBy: 'name', sortDir: 'asc' },
  );
  assert.deepEqual(
    buildCompanyQuery({ tab: 'all', salesTab: 'all', divisionId: 'all', supplierCategory: 'all', sortMode: 'default' }),
    { sortBy: 'createdAt', sortDir: 'desc' },
  );
});

test('yalnız satış/servis rolü tedarikçiyi göremez, satış rakip/potansiyeli görür', () => {
  assert.deepEqual(companyVisibility(['service']), { restricted: true, canSeeSuppliers: false, canSeeCompetitors: false, canSeePotential: false });
  assert.deepEqual(companyVisibility(['sales', 'service']), { restricted: true, canSeeSuppliers: false, canSeeCompetitors: true, canSeePotential: true });
  assert.equal(companyVisibility(['admin', 'sales']).canSeeSuppliers, true);
  assert.equal(companyVisibility([]).restricted, false);
});

test('tedarikçi rozeti ve içe aktarma dosya doğrulaması', () => {
  assert.equal(supplierCategoryLabel('transportation'), 'Nakliye');
  assert.equal(supplierCategoryLabel('manufacturer'), '');
  assert.equal(validateImportFile({ name: 'firmalar.xlsx', size: 1000 }), null);
  assert.match(validateImportFile({ name: 'firmalar.csv', size: 1000 }) ?? '', /xlsx/);
  assert.match(validateImportFile({ name: 'a.xlsx', size: 20 * 1024 * 1024 }) ?? '', /10 MB/);
});

test('sohbet başlığı sabit metin üretmez; yalnız gerçek üye sayısı', () => {
  assert.equal(memberSubtitle(null), null);
  assert.equal(memberSubtitle({ type: 'dm', members: [{ userId: 'a' }, { userId: 'b' }] }, 'a'), null);
  assert.equal(
    memberSubtitle({ type: 'dm', members: [{ userId: 'a', email: 'a@x.com' }, { userId: 'b', email: 'b@x.com' }] }, 'a'),
    'b@x.com',
  );
  assert.equal(memberSubtitle({ type: 'group', members: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }] }), '3 üye');
  assert.equal(
    memberSubtitle({ type: 'group', onlyAdminsCanPost: true, members: [{ userId: 'a' }] }),
    '1 üye · yalnız yöneticiler yazabilir',
  );
  assert.equal(memberSubtitle({ type: 'group', members: [] }), null);
});

test('sohbet adı: grupta başlık, birebirde karşı taraf', () => {
  const members = [{ userId: 'me', fullName: 'Ben' }, { userId: 'o', fullName: 'Ayşe Kaya', email: 'a@x.com' }];
  assert.equal(conversationDisplayName({ type: 'dm', title: null, members }, 'me'), 'Ayşe Kaya');
  assert.equal(conversationDisplayName({ type: 'group', title: 'Satış', members }, 'me'), 'Satış');
  assert.equal(conversationDisplayName(null, 'me', 'X'), 'X');
});

test('✓✓ yalnız birebir sohbette karşı taraf okuduysa', () => {
  const message = { senderId: 'me', createdAt: '2026-01-01T10:00:00.000Z' };
  const dm = (lastReadAt) => ({ type: 'dm', members: [{ userId: 'me', lastReadAt: null }, { userId: 'o', lastReadAt }] });
  assert.equal(isSeenByOther(message, dm('2026-01-01T10:00:00.000Z'), 'me'), true);
  assert.equal(isSeenByOther(message, dm('2026-01-01T09:59:59.000Z'), 'me'), false);
  assert.equal(isSeenByOther(message, dm(null), 'me'), false);
  assert.equal(isSeenByOther({ ...message, senderId: 'o' }, dm('2026-02-01T00:00:00.000Z'), 'me'), false);
  assert.equal(isSeenByOther(message, { type: 'group', members: [] }, 'me'), false);
});

test('grup yönetimi süper yönetici veya grup yöneticisine açık', () => {
  assert.equal(canManageGroup({ type: 'group', members: [], myRole: 'admin' }, false), true);
  assert.equal(canManageGroup({ type: 'group', members: [], myRole: 'member' }, false), false);
  assert.equal(canManageGroup({ type: 'group', members: [], myRole: 'member' }, true), true);
  assert.equal(canManageGroup({ type: 'dm', members: [], myRole: 'admin' }, true), false);
});

test('sohbet listesi okunmamış/tüm olarak gruplanır', () => {
  const { unread, rest } = groupConversations([{ id: 1, unreadCount: 2 }, { id: 2, unreadCount: 0 }, { id: 3, unreadCount: 1 }]);
  assert.deepEqual(unread.map((row) => row.id), [1, 3]);
  assert.deepEqual(rest.map((row) => row.id), [2]);
});

test('ek ve kayıt kartı güvenle normalize edilir', () => {
  assert.deepEqual(normalizeAttachment({ fileId: 'f', filename: 'a.png', mimeType: 'image/png', url: '/x', sizeBytes: 3, isImage: true }), {
    fileId: 'f', filename: 'a.png', mimeType: 'image/png', isImage: true, url: '/x', sizeBytes: 3,
  });
  assert.equal(normalizeAttachment({ id: 'g', fileName: 'b.pdf' })?.fileId, 'g');
  assert.equal(normalizeAttachment({ fileName: 'x' }), null);
  const card = parseRefCard({ type: 'quote', id: 'q1', title: 'Teklif T-1', subtitle: null });
  assert.equal(refCardRoute(card), '/modules/quotes/q1');
  assert.equal(refCardRoute({ ...card, missing: true }), null);
  assert.equal(parseRefCard('x'), null);
  assert.equal(canSearchMessages(' a '), false);
  assert.equal(canSearchMessages('ab'), true);
});

test('görev tamamlama notu zorunlu ve 480 ile sınırlı', () => {
  assert.deepEqual(buildCompletionPatch('  bitti  '), { ok: true, patch: { status: 'done', completionNote: 'bitti' } });
  assert.equal(buildCompletionPatch('   ').ok, false);
  assert.equal(buildCompletionPatch('x'.repeat(481)).ok, false);
  assert.equal(buildCompletionPatch('x'.repeat(480)).ok, true);
});

test('görev sıralama yönü, filtre sayısı, silme ve ilgili kayıtlar', () => {
  assert.equal(taskSortDir('createdAt'), 'desc');
  assert.equal(taskSortDir('dueAt'), 'asc');
  assert.equal(activeTaskFilterCount({ status: 'todo', priority: '', assignedToUserId: 'u', createdBy: '' }), 2);
  assert.equal(canDeleteTask({ canDelete: true, canManage: false, createdBy: 'u1', userId: 'u1' }), true);
  assert.equal(canDeleteTask({ canDelete: true, canManage: false, createdBy: 'u2', userId: 'u1' }), false);
  assert.equal(canDeleteTask({ canDelete: false, canManage: true }), false);
  const links = taskRelatedLinks({ quote: { id: 'q', documentNo: 'T-1' }, serviceTicket: { id: 's', ticketNo: 'S-1', subject: 'Arıza' } });
  assert.deepEqual(links.map((link) => link.route), ['/modules/quotes/q', '/modules/service-tickets/s']);
});

test('takvim aralıkları web ile aynı', () => {
  const cursor = new Date(2026, 9, 15, 13, 0);
  const week = calendarRange('week', cursor);
  assert.equal(week.from.getDay(), 1);
  assert.equal(daysInRange(week.from, week.to).length, 7);
  const day = calendarRange('day', cursor);
  assert.equal(daysInRange(day.from, day.to).length, 1);
  const month = calendarRange('month', cursor);
  assert.equal(daysInRange(month.from, month.to).length, 42);
  const list = calendarRange('list', cursor);
  assert.equal(list.from.getMonth(), 3);
  assert.equal(moveCursor('week', cursor, 1).getDate(), 22);
  assert.equal(moveCursor('list', cursor, -1).getMonth(), 3);
  assert.equal(startOfWeek(new Date(2026, 9, 18)).getDate(), 12);
});

test('takvim kaynak etiketi, düzenleme yetkisi ve doğrulama', () => {
  assert.equal(calendarSourceLabel('device'), 'Telefon');
  assert.equal(calendarSourceLabel('import'), 'İçe aktarıldı');
  assert.equal(calendarSourceLabel('manual'), null);
  assert.equal(canEditCalendarEvent({ ownerUserId: 'a', createdBy: 'b' }, 'b'), true);
  assert.equal(canEditCalendarEvent({ owner: { id: 'a' } }, 'a'), true);
  assert.equal(canEditCalendarEvent({ ownerUserId: 'a', createdBy: 'a' }, 'c'), false);
  const start = new Date(2026, 0, 1, 10);
  assert.deepEqual(validateEventDraft({ eventType: 'customer_visit', title: 'Z', companyId: null, startsAt: start, endsAt: start }), {
    companyId: 'Müşteri ziyareti için firma seçin',
  });
  assert.equal(validateEventDraft({ eventType: 'meeting', title: 'Z', companyId: null, startsAt: start, endsAt: new Date(2026, 0, 1, 9) }).endsAt, 'Bitiş başlangıçtan önce olamaz');
  const window = defaultEventWindow(new Date(2026, 0, 1, 10, 7));
  assert.equal(window.startsAt.getMinutes(), 30);
  assert.equal(window.endsAt.getHours(), 11);
  assert.equal(isCalendarFileName('ajanda.ICS'), true);
  assert.equal(isCalendarFileName('ajanda.pdf'), false);
});

test('liste görünümü yalnız dolu günleri kronolojik verir', () => {
  const sections = listSections([
    { id: 2, startsAt: new Date(2026, 0, 3, 9).toISOString() },
    { id: 1, startsAt: new Date(2026, 0, 1, 9).toISOString() },
    { id: 3, startsAt: new Date(2026, 0, 3, 8).toISOString() },
  ]);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[1].events.map((event) => event.id), [3, 2]);
});

test('firma seçici ve harita, liste ile aynı rol görünürlüğünü kullanır', () => {
  const sales = companyVisibility(['sales']);
  const service = companyVisibility(['service']);
  assert.deepEqual(visibleFirmTypes(sales), ['customer', 'supplier_customer', 'competitor']);
  assert.deepEqual(visibleFirmTypes(service), ['customer', 'supplier_customer']);
  assert.equal(isCompanyVisible({ relationType: { code: 'supplier' }, customerStatus: { code: 'active' } }, sales), false);
  assert.equal(isCompanyVisible({ relationType: { code: 'competitor' }, customerStatus: { code: 'active' } }, sales), true);
  assert.equal(isCompanyVisible({ relationType: { code: 'customer' }, customerStatus: { code: 'potential' } }, service), false);
  assert.equal(isCompanyVisible({ relationType: { code: 'customer' }, customerStatus: { code: 'active' } }, service), true);
});
