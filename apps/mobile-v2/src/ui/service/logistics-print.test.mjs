import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {printDocument} from '../../native/print-document.ts';
const api={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./logistics-print.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,require:()=>({printDocument})});
const {installationPrint,dispatchPrint}=api;
test('installation PDF retains checks, problem actions and both signature fields',()=>{
 const html=installationPrint({formNo:'K-1',checks:[{label:'Yağlama',status:'not_done',note:'Kontrol bekliyor'}],problemHasProblem:'yes',problemNote:'<ariza>',problemActionNote:'Parça sipariş edildi',kurulumuYapan:'Teknisyen',teslimAlan:'Müşteri'},{notes:'Gelecek hafta takip'});
 for(const text of ['K-1','Tamamlanmadı','Kontrol bekliyor','&lt;ariza&gt;','Parça sipariş edildi','Teknisyen','Müşteri','Gelecek hafta takip'])assert.ok(html.includes(text),text);
});
test('dispatch PDF keeps every shipment item, serial and route without markup injection',()=>{
 const html=dispatchPrint({irsaliyeNo:'I-1',origin:'Depo',destination:'Fabrika',items:[{description:'<Tezgah>',serialNumber:'SN-1',quantity:'2',unit:'adet'},{description:'İkinci ürün',serialNumber:'SN-2',quantity:'1',unit:'adet'}]});
 for(const text of ['I-1','Depo','Fabrika','&lt;Tezgah&gt;','SN-1','SN-2','İkinci ürün'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('<Tezgah>'));
});
