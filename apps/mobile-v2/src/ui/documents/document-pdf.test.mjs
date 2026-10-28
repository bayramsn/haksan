import assert from 'node:assert/strict';
import test from 'node:test';
import { documentPdfRequest, shareSavedDocument } from './document-pdf.ts';
test('all documents request their own authorized server generator including standalone records', () => {
  for(const [kind,resource] of [['quote','quotes'],['proforma','proformas'],['contract','contracts']]) assert.equal(documentPdfRequest(kind,'record-1').path,`/${resource}/record-1/generate-pdf`);
  for(const id of ['', '../other','id?companyId=x','id/path']) assert.throws(()=>documentPdfRequest('quote',id));
});
test('PDF failure is propagated independently from a completed save so retry does not create another record',async()=>{
  const requests=[];
  await assert.rejects(shareSavedDocument('contract','saved-id','SOZ-1', async(path)=>{requests.push(path);throw new Error('offline');}),/offline/);
  assert.deepEqual(requests,['/contracts/saved-id/generate-pdf']);
});
