import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceNoteBody, serviceNoteLines, serviceNoteTemplateId, serviceNoteTemplateKey, serviceTemplateValidation } from './service-quote-templates.ts';
test('saved web template keys round trip without treating built-in variants as records', () => {
  assert.equal(serviceNoteTemplateId('teknik-servis'), null);
  assert.equal(serviceNoteTemplateId(serviceNoteTemplateKey('template-id')), 'template-id');
});
test('saved note text supports CRLF and preserves ordered lines copied into the document', () => {
  assert.deepEqual(serviceNoteLines('  Birinci\r\n\r\n İkinci \n'), ['Birinci', 'İkinci']);
  assert.equal(serviceNoteBody([' Birinci ', '', 'İkinci ']), 'Birinci\nİkinci');
});
test('template validation rejects empty and oversized records before API submission', () => {
  for (const [title, body] of [['', 'note'], ['title', ' '], ['x'.repeat(201), 'note'], ['title', 'x'.repeat(12001)]]) assert.ok(serviceTemplateValidation(title, body));
  assert.equal(serviceTemplateValidation('x'.repeat(200), 'x'.repeat(12000)), null);
});
