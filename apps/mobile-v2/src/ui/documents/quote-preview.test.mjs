import assert from 'node:assert/strict';import test from 'node:test';
import { quoteTotalsPreview } from './quote-preview.ts';
const line={quantity:2,unitPrice:100,discountAmount:20,vatRate:20,description:'Makine',compatibility:{lineGroupKey:'one'}};
test('header discount reduces each VAT base proportionally as on web',()=>{
 const t=quoteTotalsPreview([line],[],{amount:0,percent:10},1);assert.equal(t.gross,200);assert.equal(t.lineDiscount,20);assert.equal(t.headerDiscount,18);assert.equal(t.vat,32.4);assert.equal(t.grand,194.4);
});
test('nationalized quotes do not display a fabricated total while FX is unavailable',()=>{
 const source=[{nationalized:true,productTypeCode:'CNC_DIK_ISLEME_MERKEZ',lineGroupKey:'one'}];
 assert.equal(quoteTotalsPreview([line],source,{amount:0,percent:0},null).grand,null);
 assert.ok(quoteTotalsPreview([line],source,{amount:0,percent:0},1).customs>2600);
});
