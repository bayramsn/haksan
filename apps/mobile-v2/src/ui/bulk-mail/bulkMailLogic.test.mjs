import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRecipients,
  campaignActions,
  capWarning,
  composeProblem,
  countByStatus,
  estimatedMinutes,
  listFileProblem,
  parseResultMessage,
  pastedListToCsv,
  progressText,
  statusMeta,
  toCreatePayload,
  utf8ToBase64,
} from './bulkMailLogic.ts';

test('alıcı ekleme küçük harfe indirir, tekilleştirir ve sınırı aşanı sayar', () => {
  const first = addRecipients([], [
    { email: 'Ali@Firma.com', source: 'CRM' },
    { email: 'ali@firma.com ', source: 'Liste' },
    { email: 'veli@firma.com', source: 'Liste' },
  ]);
  assert.deepEqual(first.list.map((r) => r.email), ['ali@firma.com', 'veli@firma.com']);
  assert.equal(first.list[0].source, 'CRM');
  assert.equal(first.added, 2);
  const capped = addRecipients(first.list, [{ email: 'a@b.co', source: 'Liste' }, { email: 'c@d.co', source: 'Liste' }], 3);
  assert.equal(capped.list.length, 3);
  assert.equal(capped.skipped, 1);
  assert.equal(capWarning(capped.skipped, 3), '3 alıcı sınırı: 1 adres eklenmedi');
  assert.equal(capWarning(0), null);
});

test('durum etiketleri web ile aynı; bilinmeyen durum ham kalır', () => {
  assert.deepEqual(statusMeta('sending'), { label: 'Gönderiliyor', tone: 'info' });
  assert.equal(statusMeta('cancelled').label, 'Durduruldu');
  assert.equal(statusMeta('skipped').label, 'Atlandı');
  assert.deepEqual(statusMeta('weird'), { label: 'weird', tone: 'neutral' });
});

test('ilerleme metni hata ve atlananları yalnız varsa yazar', () => {
  assert.equal(progressText({ sent: 3, total: 10, failed: 0, skipped: 0 }), '3/10');
  assert.equal(progressText({ sent: 3, total: 10, failed: 2, skipped: 1 }), '3/10 · 2 hata · 1 atlandı');
});

test('durdur / sürdür kuralı', () => {
  const counts = countByStatus([{ status: 'sent' }, { status: 'pending' }, { status: 'pending' }]);
  assert.deepEqual(counts, { sent: 1, pending: 2 });
  assert.deepEqual(campaignActions('sending', counts, true), { canCancel: true, resumeCount: 0 });
  assert.deepEqual(campaignActions('cancelled', counts, true), { canCancel: false, resumeCount: 2 });
  assert.deepEqual(campaignActions('cancelled', counts, false), { canCancel: false, resumeCount: 0 });
  assert.deepEqual(campaignActions('completed', { sent: 4 }, true), { canCancel: false, resumeCount: 0 });
});

test('süre tahmini dakikada 20 ileti, en az 1 dakika', () => {
  assert.equal(estimatedMinutes(1), 1);
  assert.equal(estimatedMinutes(20), 1);
  assert.equal(estimatedMinutes(21), 2);
  assert.equal(estimatedMinutes(300), 15);
});

test('gönderim öncesi kontrol sırası', () => {
  const ok = { ready: true, recipients: 2, subject: 'Katalog', body: 'Merhaba' };
  assert.equal(composeProblem(ok), null);
  assert.match(composeProblem({ ...ok, ready: false }), /Gönderici hesabı/);
  assert.equal(composeProblem({ ...ok, recipients: 0 }), 'En az bir alıcı seçin');
  assert.equal(composeProblem({ ...ok, subject: '  ' }), 'Konu zorunludur');
  assert.equal(composeProblem({ ...ok, body: '' }), 'Mesaj zorunludur');
});

test('oluşturma gövdesi: kaynak atılır, kontak yalnız firmayla gider, boş ek yok', () => {
  const payload = toCreatePayload({
    subject: ' Katalog ',
    body: ' Merhaba {{ad}} ',
    fileIds: [],
    recipients: [
      { email: 'a@b.co', name: '  ', companyName: 'X'.repeat(300), contactId: 'c1', source: 'Liste' },
      { email: 'c@d.co', name: 'Ali', companyId: 'co1', contactId: 'c2', source: 'CRM' },
    ],
  });
  assert.equal(payload.subject, 'Katalog');
  assert.equal(payload.body, 'Merhaba {{ad}}');
  assert.equal(payload.fileIds, undefined);
  assert.deepEqual(payload.recipients[0], { email: 'a@b.co', name: undefined, companyName: 'X'.repeat(255), companyId: undefined, contactId: undefined });
  assert.deepEqual(payload.recipients[1], { email: 'c@d.co', name: 'Ali', companyName: undefined, companyId: 'co1', contactId: 'c2' });
  assert.equal('source' in payload.recipients[1], false);
  assert.deepEqual(toCreatePayload({ subject: 's', body: 'b', fileIds: ['f1'], recipients: [] }).fileIds, ['f1']);
});

test('liste dosyası yalnız .xlsx/.csv ve 2 MB', () => {
  assert.equal(listFileProblem({ name: 'liste.CSV', size: 100 }), null);
  assert.equal(listFileProblem({ name: 'liste.xlsx', size: null }), null);
  assert.ok(listFileProblem({ name: 'liste.xls', size: 100 }));
  assert.ok(listFileProblem({ name: 'liste.csv', size: 3 * 1024 * 1024 }));
});

test('yapıştırılan liste CSV satırlarına dönüşür', () => {
  const csv = pastedListToCsv('E-posta;Ad Soyad\n\nali@x.com;Ali "Usta"\nVeli <veli@y.com>\n  zeynep@z.com\t Zeynep \r\n');
  assert.equal(csv, ['"E-posta","Ad Soyad"', '"ali@x.com","Ali ""Usta"""', '"Veli","veli@y.com"', '"zeynep@z.com","Zeynep"'].join('\n'));
  assert.equal(pastedListToCsv('  \n '), '');
});

test('UTF-8 base64 Buffer ile aynı sonucu verir', () => {
  for (const text of ['', 'a', 'ab', 'abc', 'Şirket Ünvanı ğüşiöç', '"E-posta"\n"ali@x.com"', '😀 emoji']) {
    assert.equal(utf8ToBase64(text), Buffer.from(text, 'utf8').toString('base64'), text);
  }
});

test('liste okuma mesajı', () => {
  assert.equal(parseResultMessage({ rows: [1, 2], invalid: 0 }), '2 adres okundu');
  assert.equal(parseResultMessage({ rows: [1], invalid: 3 }), '1 adres okundu · 3 satırda geçerli e-posta yok, atlandı.');
});
