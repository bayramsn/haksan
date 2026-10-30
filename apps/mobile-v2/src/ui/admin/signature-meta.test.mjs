import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSignatureFile, signatureDataUrl, signatureImageMeta } from './signature-meta.ts';

test('signatureImageMeta uzantı ve MIME uyumunu ister', () => {
  assert.deepEqual(signatureImageMeta('imza.PNG', 'image/png'), { extension: 'png', mimeType: 'image/png' });
  assert.deepEqual(signatureImageMeta('imza.jpg', null), { extension: 'jpg', mimeType: 'image/jpeg' });
  assert.equal(signatureImageMeta('imza.png', 'image/jpeg'), null);
  assert.equal(signatureImageMeta('imza.gif', 'image/gif'), null);
});

test('normalizeSignatureFile HEIC adlı JPEG çıktısını düzeltir', () => {
  assert.deepEqual(normalizeSignatureFile('IMG_0001.HEIC', 'image/jpeg'), {
    filename: 'IMG_0001.jpg',
    meta: { extension: 'jpg', mimeType: 'image/jpeg' },
  });
  assert.equal(normalizeSignatureFile('IMG_0001.HEIC', 'image/heic'), null);
  assert.equal(normalizeSignatureFile('imza.webp', 'image/webp')?.filename, 'imza.webp');
});

test('signatureDataUrl sunucu regex biçimini üretir', () => {
  const url = signatureDataUrl({ extension: 'png', mimeType: 'image/png' }, 'iVBO\nRw0K==');
  assert.match(url, /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
});
