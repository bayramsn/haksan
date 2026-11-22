import test from 'node:test';import assert from 'node:assert/strict';import {createMailDocumentStore} from './mail-document-store.ts';
const draft={label:'Teknik föy',payload:{productDocument:{id:'product-id',pdf:{html:'<html>CRM</html>',filename:'teknik.pdf'}}}};
test('generated mail documents stay scoped and expire without persisting customer content',()=>{let scope='a',now=0,n=0;const store=createMailDocumentStore(()=>scope,()=>String(++n),()=>now);const id=store.stage(draft);assert.equal(store.read(id),draft);assert.equal(store.read(id),draft);scope='b';assert.equal(store.read(id),null);scope='a';assert.equal(store.read(id),null);const next=store.stage(draft);now=30*60_000;assert.equal(store.read(next),null);});
test('successful send removes the one-use document and pending drafts are bounded',()=>{let n=0;const store=createMailDocumentStore(()=>'',()=>String(++n));const id=store.stage(draft);store.remove(id);assert.equal(store.read(id),null);const ids=Array.from({length:6},()=>store.stage(draft));assert.equal(store.read(ids[0]),null);assert.equal(store.read(ids[5]),draft);});
test('server-generated commercial attachment carries only the record reference and remains scoped',()=>{
 let scope='a',n=0;const store=createMailDocumentStore(()=>scope,()=>String(++n));
 const reference={label:'Sözleşme',payload:{document:{id:'11111111-2222-4333-8444-555555555555',kind:'contract'}}};
 const id=store.stage(reference);assert.deepEqual(store.read(id),reference);assert.equal(store.read(id).payload.document.pdf,undefined);
 scope='b';assert.equal(store.read(id),null);
 for(const payload of [{document:{id:'../wrong',kind:'contract'}},{document:{id:reference.payload.document.id,kind:'invoice'}},{...draft.payload,...reference.payload},{}])assert.throws(()=>store.stage({label:'invalid',payload}));
});
test('report mail drafts are scoped, expiring, and cannot silently replace another attachment kind',()=>{
 let scope='a',time=0;const store=createMailDocumentStore(()=>scope,()=>String(time),()=>time);
 const report={label:'Hedef raporu',payload:{reportDocument:{html:'<html>Rapor</html>',filename:'hedef.pdf'}}};
 const id=store.stage(report);assert.equal(store.read(id),report);assert.throws(()=>store.stage({label:'Mixed',payload:{...report.payload,...draft.payload}}));
 time=30*60_000;assert.equal(store.read(id),null);const next=store.stage(report);scope='b';assert.equal(store.read(next),null);
});
