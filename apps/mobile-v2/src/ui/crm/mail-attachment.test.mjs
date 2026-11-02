import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMailAttachment } from './mail-attachment.ts';
import { MAIL_MAX_ATTACHMENTS, MAIL_MAX_ATTACHMENT_BYTES } from '@haksan/shared';
test('mail ekleri web dosya tipi, toplam boyut ve adet sınırını korur', () => {
 assert.equal(validateMailAttachment([], { extension: 'pdf', sizeBytes: 1024 }), null);
 assert.ok(validateMailAttachment([], { extension: 'mp3', sizeBytes: 1024 }));
 assert.ok(validateMailAttachment(Array.from({length: MAIL_MAX_ATTACHMENTS}, () => ({sizeBytes:1})), {extension:'png',sizeBytes:1}));
 assert.equal(validateMailAttachment(Array.from({length: MAIL_MAX_ATTACHMENTS-1}, () => ({sizeBytes:1})), {extension:'png',sizeBytes:1}), null);
 assert.equal(validateMailAttachment([{sizeBytes:MAIL_MAX_ATTACHMENT_BYTES-1}], {extension:'pdf',sizeBytes:1}), null);
 assert.equal(validateMailAttachment([{sizeBytes:MAIL_MAX_ATTACHMENT_BYTES}], {extension:'pdf',sizeBytes:1}), `Eklerin toplamı ${Math.round(MAIL_MAX_ATTACHMENT_BYTES / (1024*1024))} MB’ı aşamaz.`);
 assert.ok(validateMailAttachment([], {extension:'pdf',sizeBytes:NaN}));
 for (const sizeBytes of [NaN, -1, Infinity]) assert.ok(validateMailAttachment([{sizeBytes}], {extension:'pdf',sizeBytes:1}));
});
