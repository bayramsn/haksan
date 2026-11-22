import assert from 'node:assert/strict';
import test from 'node:test';
import { documentPdfRequest, shareSavedDocument } from './document-pdf.ts';

const io = (log, fail = {}) => ({
  post: async (path) => { log.push(`POST ${path}`); if (fail.post) throw fail.post; },
  get: async (path) => { log.push(`GET ${path}`); if (fail.get) throw fail.get; },
  prepare: async (path) => { log.push(`PREPARE ${path}`); if (fail.prepare) throw fail.prepare; },
});

test('quotes use generate-pdf; proformas and contracts use the live prepared PDF endpoint', () => {
  assert.deepEqual(documentPdfRequest('quote', 'record-1'), { method: 'POST', path: '/quotes/record-1/generate-pdf', filename: 'quote-record-1.pdf' });
  for (const [kind, resource] of [['proforma', 'proformas'], ['contract', 'contracts']]) {
    const request = documentPdfRequest(kind, 'record-1');
    assert.equal(request.method, 'GET');
    assert.equal(request.path, `/${resource}/record-1/pdf`);
    assert.equal(request.prepare, `/${resource}/record-1/pdf`);
  }
  assert.throws(() => documentPdfRequest('invoice', 'record-1'));
  for (const id of ['', '../other', 'id?companyId=x', 'id/path']) assert.throws(() => documentPdfRequest('quote', id));
});

test('prepared PDF: prepare then download; read-only users skip a 403 prepare', async () => {
  const log = [];
  await shareSavedDocument('contract', 'saved-id', 'SOZ-1', io(log));
  assert.deepEqual(log, ['PREPARE /contracts/saved-id/pdf', 'GET /contracts/saved-id/pdf']);
  const readOnly = [];
  await shareSavedDocument('proforma', 'p-1', 'PRF-1', io(readOnly, { prepare: Object.assign(new Error('no'), { status: 403 }) }));
  assert.deepEqual(readOnly, ['PREPARE /proformas/p-1/pdf', 'GET /proformas/p-1/pdf']);
});

test('PDF failure is propagated independently from a completed save so retry does not create another record', async () => {
  const log = [];
  await assert.rejects(shareSavedDocument('contract', 'saved-id', 'SOZ-1', io(log, { prepare: new Error('offline') })), /offline/);
  assert.deepEqual(log, ['PREPARE /contracts/saved-id/pdf']);
  await assert.rejects(shareSavedDocument('quote', 'q-1', 'TKF-1', io([], { post: new Error('offline') })), /offline/);
});
