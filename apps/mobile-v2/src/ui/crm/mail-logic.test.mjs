import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCcAddress,
  initialMailBody,
  isMailAccountReady,
  isValidEmail,
  mailComposeHref,
  mailSignature,
  validateMailDraft,
} from './mail-logic.ts';

const account = { featureEnabled: true, configured: true, status: 'active', signature: null, defaultSignature: 'Ad Soyad' };

test('gönderici hesabı yalnız etkin + yapılandırılmış + active iken hazır', () => {
  assert.equal(isMailAccountReady(account), true);
  assert.equal(isMailAccountReady({ ...account, status: 'error' }), false);
  assert.equal(isMailAccountReady({ ...account, configured: false }), false);
  assert.equal(isMailAccountReady(null), false);
});

test('imza: kayıtlı imza, yoksa varsayılan', () => {
  assert.equal(mailSignature(account), 'Ad Soyad');
  assert.equal(mailSignature({ ...account, signature: '' }), '');
  assert.equal(mailSignature({ ...account, signature: 'Özel' }), 'Özel');
  assert.equal(mailSignature(undefined), '');
});

test('taslak doğrulama web mesajlarıyla', () => {
  assert.equal(validateMailDraft({ to: '', subject: 'a', body: 'b' }), 'Alıcı, konu ve mesaj zorunludur');
  assert.equal(validateMailDraft({ to: 'x', subject: 'a', body: 'b' }), 'Geçerli bir e-posta adresi girin');
  assert.equal(validateMailDraft({ to: 'a@b.co', subject: 'a', body: 'x'.repeat(10_001) }), 'Mesaj en fazla 10.000 karakter olabilir');
  assert.equal(validateMailDraft({ to: 'a@b.co', subject: 'a', body: 'b' }), null);
});

test('CC ekleme: geçersiz reddedilir, tekrar eklenmez', () => {
  assert.deepEqual(addCcAddress([], 'kötü'), { list: [], error: 'Geçerli bir e-posta adresi girin' });
  assert.deepEqual(addCcAddress(['a@b.co'], ' a@b.co '), { list: ['a@b.co'], error: null });
  assert.deepEqual(addCcAddress([], 'c@d.co'), { list: ['c@d.co'], error: null });
  assert.equal(isValidEmail('ali@haksan.com.tr'), true);
});

test('karşılama metni ve rota', () => {
  assert.equal(initialMailBody('Ayşe'), 'Merhaba Ayşe,\n\n');
  assert.equal(initialMailBody(null), 'Merhaba,\n\n');
  assert.equal(mailComposeHref({}), '/modal/mail-compose');
  assert.equal(
    mailComposeHref({ to: 'a@b.co', name: 'Ali Veli', companyId: 'c1', contactId: null }),
    '/modal/mail-compose?to=a%40b.co&name=Ali%20Veli&companyId=c1',
  );
});
