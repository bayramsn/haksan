import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { CONTRACT_NOTE_VARIANTS, CONTRACT_NOTE_METADATA, contractVariantTerms, contractFillContext, fillTerms } from './contract-note-variants.ts';
test('mobile contract wording and commercial metadata match the web source', () => {
  const web={};
  const source=readFileSync(new URL('../../../../web/src/app/lib/print/notes.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:web});
  assert.deepEqual(CONTRACT_NOTE_VARIANTS,JSON.parse(JSON.stringify(web.CONTRACT_NOTE_VARIANTS)));
  assert.deepEqual(CONTRACT_NOTE_METADATA,JSON.parse(JSON.stringify(web.CONTRACT_NOTE_METADATA)));
});
test('built-in contract replaces buyer and control unit without replacement-token expansion', () => {
  const terms=contractVariantTerms('isletme-teslim',{alici:'ABC $& Makina',kontrolMarka:'FANUC'});
  assert.ok(terms.delivery.includes('ABC $& Makina tesislerine'));
  assert.ok(terms.warranty.includes('FANUC/Türkiye'));
  assert.ok(!JSON.stringify(terms).includes('{{'));
  assert.equal(contractVariantTerms('missing',{}),null);
});
test('context ignores accessory VAT and reads main-machine control details', () => {
  const ctx=contractFillContext({buyer:'Firma',date:'2027-01-01',items:[
    {description:'↳ Opsiyon: Takım',vatRate:'20'},
    {description:'Tezgah',vatRate:'10',compatibility:{technicalSpecs:[{key:'CNC Kontrol Ünitesi',value:'Siemens 828D'}]}},
  ]});
  assert.equal(ctx.kdvOrani,10);assert.equal(ctx.kontrolMarka,'SIEMENS');assert.equal(ctx.yil,'2027');
  assert.deepEqual(fillTerms({payment:'{{YIL}} %{{KDV_ORANI}}',delivery:'{{ALICI}}',warranty:'{{KONTROL_MARKA}}'},ctx),{payment:'2027 %10',delivery:'Firma',warranty:'SIEMENS'});
});
