import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMailAttachment } from './mail-attachment.ts';
test('mail ekleri web dosya tipi, toplam boyut ve adet sınırını korur', () => {
 assert.equal(validateMailAttachment([], { extension: 'pdf', sizeBytes: 1024 }), null);
 assert.ok(validateMailAttachment([], { extension: 'mp3', sizeBytes: 1024 }));
 assert.ok(validateMailAttachment(Array.from({length: 5}, () => ({sizeBytes:1})), {extension:'png',sizeBytes:1}));
 assert.ok(validateMailAttachment([{sizeBytes:15*1024*1024}], {extension:'pdf',sizeBytes:1}));
 assert.ok(validateMailAttachment([], {extension:'pdf',sizeBytes:NaN}));
});
