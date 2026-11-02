import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentProblem,
  canDeleteTradeFair,
  distinctSorted,
  emptyContactForm,
  followUpDraft,
  formFromRow,
  changeTradeFairDivision,
  createTradeFairActionGuard,
  saveTradeFairFlags,
  toggleTradeFairProduct,
  productTypeOptions,
  staffOptions,
  summaryTotals,
  tradeFairLocation,
  tradeFairRowTone,
  tradeFairListParams,
  metByFilterOptions,
  filePreviewPath,
  tradeFairPhotoKey,
} from './tradeFairLogic.ts';

const row = {
  ...emptyContactForm('Win Eurasia', 'u1'),
  id: 'r1',
  companyName: 'Acme',
  contactName: 'Ali',
  province: 'Bursa',
  district: 'Nilüfer',
  contactTitle: null,
  metByName: 'Ayşe',
  createdBy: 'u1',
  createdAt: '2026-05-01T10:00:00Z',
  products: [{ id: 'p1', name: 'CNC' }],
  calledAt: null, quotedAt: null, companyId: null, opportunityId: null,
};

test('row tone follows web colors', () => {
  assert.equal(tradeFairRowTone({ ...row }), null);
  assert.equal(tradeFairRowTone({ ...row, calledAt: '2026-05-01' }), 'warning');
  assert.equal(tradeFairRowTone({ ...row, calledAt: '2026-05-01', quotedAt: '2026-05-01' }), 'success');
  assert.equal(tradeFairRowTone({ ...row, companyId: 'c1' }), 'success');
});

test('location hides Türkiye and falls back to dash', () => {
  assert.equal(tradeFairLocation(row), 'Nilüfer / Bursa');
  assert.equal(tradeFairLocation({ district: null, province: 'Bayern', country: 'Almanya' }), 'Bayern / Almanya');
  assert.equal(tradeFairLocation({ district: null, province: null, country: 'Türkiye' }), '—');
});

test('follow-up derives real server flags without claiming CRM conversion', () => {
  assert.deepEqual(followUpDraft(row), { called: false, quoted: false });
  assert.deepEqual(followUpDraft({ ...row, calledAt: '2026-05-01', quotedAt: '2026-05-02' }), { called: true, quoted: true });
  assert.equal('customerConverted' in emptyContactForm(), false);
});

test('division switch clears previous catalog while same division preserves products', () => {
  const form = { ...emptyContactForm(), divisionId: 'd1', productModelIds: ['p1'], productCategory: 'Lazer', productType: 'Fiber' };
  assert.equal(changeTradeFairDivision(form, 'd1'), form);
  const next = changeTradeFairDivision(form, 'd2');
  assert.equal(next.divisionId, 'd2');
  assert.deepEqual(next.productModelIds, []);
  assert.equal(next.productCategory, '');
  assert.equal(next.productType, '');
});

test('multi-product selection toggles ids and respects server twenty-product maximum', () => {
  const product = { id: 'p1', name: 'Fiber', category: 'Lazer' };
  const form = toggleTradeFairProduct(emptyContactForm(), product);
  assert.deepEqual(form.productModelIds, ['p1']);
  assert.equal(form.productType, 'Fiber');
  assert.deepEqual(toggleTradeFairProduct(form, product).productModelIds, []);
  const full = { ...form, productModelIds: Array.from({ length: 20 }, (_, i) => `p${i}`) };
  assert.equal(toggleTradeFairProduct(full, { ...product, id: 'other' }), full);
});

test('form from row keeps values and fills defaults', () => {
  const form = formFromRow(row);
  assert.equal(form.companyName, 'Acme');
  assert.equal(form.contactTitle, '');
  assert.equal(form.visitorCount, 1);
  assert.equal('id' in form, false);
  assert.deepEqual(form.productModelIds, ['p1']);
});

test('staff options keep departed employee visible', () => {
  const staff = [{ id: 'u2', fullName: 'Veli' }];
  const options = staffOptions(staff, { ...row, metByUserId: 'u9', metByName: 'Eski' });
  assert.equal(options.length, 2);
  assert.equal(options[1].fullName, 'Eski (ayrıldı)');
  assert.equal(staffOptions(staff, null).length, 1);
});

test('delete permission requires manager or owner', () => {
  assert.equal(canDeleteTradeFair(row, { canDelete: true, isManager: false, userId: 'u1' }), true);
  assert.equal(canDeleteTradeFair(row, { canDelete: true, isManager: false, userId: 'u2' }), false);
  assert.equal(canDeleteTradeFair(row, { canDelete: true, isManager: true, userId: 'u2' }), true);
  assert.equal(canDeleteTradeFair(row, { canDelete: false, isManager: true, userId: 'u1' }), false);
});

test('attachment validation matches web limits', () => {
  assert.equal(attachmentProblem({ name: 'a.pdf', extension: 'pdf', sizeBytes: 10 }), null);
  assert.match(attachmentProblem({ name: 'a.mp3', extension: 'mp3', sizeBytes: 10 }) ?? '', /PDF, DOCX/);
  assert.match(attachmentProblem({ name: 'a.jpg', extension: 'jpg', sizeBytes: 26 * 1024 * 1024 }) ?? '', /25 MB/);
});

test('summary totals and option helpers', () => {
  const totals = summaryTotals({
    fairs: [{ name: 'A', total: 2, lastAt: '' }],
    byUser: [
      { userId: 'u1', fullName: 'A', meetings: 2, people: 5 },
      { userId: null, fullName: null, meetings: 1, people: 1 },
    ],
  });
  assert.deepEqual(totals, { fairs: 1, meetings: 3, people: 6, staff: 2 });
  assert.deepEqual(distinctSorted([' Lazer ', 'Abkant', null, 'Lazer']), ['Abkant', 'Lazer']);
  const products = [
    { category: 'Lazer', type: 'Fiber' },
    { category: 'Abkant', type: 'CNC' },
  ];
  assert.deepEqual(productTypeOptions(products, 'Lazer'), ['Fiber']);
  assert.deepEqual(productTypeOptions(products, ''), ['CNC', 'Fiber']);
});

test('native confirmation guard blocks duplicate writes, closed screens, and account/scope changes', () => {
  let context = 'tenant-a:user-a:division-a';
  const guard = createTradeFairActionGuard(context, () => context);
  assert.equal(guard.begin(), true);
  assert.equal(guard.begin(), false, 'second confirmation cannot start while saving');
  guard.finish();
  assert.equal(guard.begin(), true);
  guard.finish();
  guard.dispose();
  assert.equal(guard.begin(), false, 'native alert surviving modal unmount cannot write');
  guard.activate();
  assert.equal(guard.begin(), true, 'React strict effect setup may reactivate same mounted scope');
  guard.finish();
  context = 'tenant-b:user-b:division-b';
  assert.equal(guard.begin(), false, 'old alert cannot write under the new account');
  assert.equal(guard.isCurrent(), false);
});

test('partial flag failure retains successful baseline and only retries the failed flag', async () => {
  const calls = [];
  const confirmed = { called: false, quoted: false };
  const form = { called: true, quoted: true };
  let fail = true;
  const save = async (flag, value) => {
    calls.push([flag, value]);
    if (flag === 'quoted' && fail) throw new Error('Network unavailable');
  };
  await assert.rejects(saveTradeFairFlags(form, confirmed, save, () => true), /Network unavailable/);
  assert.deepEqual(confirmed, { called: true, quoted: false });
  fail = false;
  assert.equal(await saveTradeFairFlags(form, confirmed, save, () => true), true);
  assert.deepEqual(calls, [['called', true], ['quoted', true], ['quoted', true]]);
  assert.deepEqual(confirmed, form);
  assert.equal(await saveTradeFairFlags({ called: false, quoted: false }, confirmed, save, () => false), false);
  assert.equal(calls.length, 3, 'scope change prevents any next request');
});

test('list params drop empty filters and district without province (web listParams)', () => {
  const base = { fairName: null, q: '', divisionId: null, metByUserId: null, province: null, district: null };
  assert.deepEqual(tradeFairListParams(base), {
    fairName: undefined, q: undefined, divisionId: undefined, metByUserId: undefined, province: undefined, district: undefined,
  });
  assert.deepEqual(
    tradeFairListParams({ fairName: 'WIN', q: '  lazer ', divisionId: 'd1', metByUserId: 'u1', province: 'Konya', district: 'Selçuklu' }),
    { fairName: 'WIN', q: 'lazer', divisionId: 'd1', metByUserId: 'u1', province: 'Konya', district: 'Selçuklu' },
  );
  assert.equal(tradeFairListParams({ ...base, district: 'Selçuklu' }).district, undefined);
});

test('met-by filter lists only users with meetings and keeps a selected absent user', () => {
  const byUser = [
    { userId: 'u1', fullName: 'Ayşe', meetings: 3, people: 4 },
    { userId: null, fullName: null, meetings: 1, people: 1 },
    { userId: 'u2', fullName: null, meetings: 1, people: 1 },
  ];
  assert.deepEqual(metByFilterOptions(byUser, null, []), [
    { value: 'u1', label: 'Ayşe' },
    { value: 'u2', label: 'Belirtilmemiş' },
  ]);
  assert.deepEqual(metByFilterOptions([], 'u9', [{ id: 'u9', fullName: 'Mehmet' }]), [{ value: 'u9', label: 'Mehmet' }]);
  assert.deepEqual(metByFilterOptions([], 'u8', []), [{ value: 'u8', label: 'Seçili kişi' }]);
});

test('file preview path matches web fileService.imagePreview', () => {
  assert.equal(filePreviewPath('abc-123'), '/files/abc-123/preview');
});

test('photo key is per link so one file on two contacts stays distinct', () => {
  assert.notEqual(tradeFairPhotoKey({ contactId: 'c1', fileId: 'f1' }), tradeFairPhotoKey({ contactId: 'c2', fileId: 'f1' }));
  assert.equal(tradeFairPhotoKey({ contactId: 'c1', fileId: 'f1' }), 'c1:f1');
});
