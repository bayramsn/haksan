import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentProblem,
  canDeleteTradeFair,
  distinctSorted,
  emptyContactForm,
  followUpDraft,
  formFromRow,
  istanbulToday,
  productTypeOptions,
  staffOptions,
  summaryTotals,
  tradeFairLocation,
  tradeFairRowTone,
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
};

test('row tone follows web colors', () => {
  assert.equal(tradeFairRowTone({ ...row }), null);
  assert.equal(tradeFairRowTone({ ...row, contacted: true }), 'warning');
  assert.equal(tradeFairRowTone({ ...row, contacted: true, offerSent: true }), 'success');
  assert.equal(tradeFairRowTone({ ...row, customerConverted: true }), 'success');
});

test('location hides Türkiye and falls back to dash', () => {
  assert.equal(tradeFairLocation(row), 'Nilüfer / Bursa');
  assert.equal(tradeFairLocation({ district: null, province: 'Bayern', country: 'Almanya' }), 'Bayern / Almanya');
  assert.equal(tradeFairLocation({ district: null, province: null, country: 'Türkiye' }), '—');
});

test('follow-up draft marks contacted and defaults to Istanbul today', () => {
  const now = new Date('2026-03-01T22:30:00Z');
  const draft = followUpDraft(row, true, now);
  assert.equal(draft.contacted, true);
  assert.equal(draft.contactDate, '2026-03-02');
  assert.equal(draft.contactNotes, '');
  assert.equal(followUpDraft({ ...row, contactDate: '2026-01-05' }, false, now).contacted, false);
  assert.equal(istanbulToday(now), '2026-03-02');
});

test('form from row keeps values and fills defaults', () => {
  const form = formFromRow(row);
  assert.equal(form.companyName, 'Acme');
  assert.equal(form.contactTitle, '');
  assert.equal(form.visitorCount, 1);
  assert.equal('id' in form, false);
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
