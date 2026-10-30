import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteCompanyDraft, quoteCompanyPatch } from './quote-company-details.ts';
import { quoteLinesUntouched, quoteOpportunityDefaults } from './quote-opportunity-defaults.ts';
import { companyUpdateSchema } from '@haksan/shared';
test('PDF adresi güncellenirken diğer adres, kimlik ve koordinatlar korunur', () => {
 const addresses = [{id:'00000000-0000-4000-8000-000000000001',addressType:'office',country:'Türkiye',province:'İstanbul',district:'Tuzla',fullAddress:'Eski',isDefault:true,isShipping:false,isBilling:true,latitude:'40.8',longitude:'29.3'}, {id:'00000000-0000-4000-8000-000000000002',addressType:'shipping',country:'Türkiye',province:'Bursa',district:'Nilüfer',fullAddress:'Depo',isDefault:false,isShipping:true,isBilling:false}];
 const draft = {...quoteCompanyDraft('Firma',addresses[0]),address:'Yeni adres'};
 const patch = quoteCompanyPatch(addresses,addresses[0].id,draft);
 assert.equal(patch.addresses[0].fullAddress,'Yeni adres');
 assert.equal(patch.addresses[0].latitude,40.8);
 assert.equal(patch.addresses[1].fullAddress,'Depo');
 assert.equal(patch.addresses[1].addressType,'shipping');
 assert.equal(companyUpdateSchema.safeParse(patch).success,true);
 assert.equal(addresses[0].fullAddress,'Eski');
});
test('fırsatın makine miktarları ve para birimi aktarılır, dolu kalemler korunur', () => {
 const defaults=quoteOpportunityDefaults({title:'Talep',requestedMachine:null,products:[{machineName:'CNC',quantity:2,productModelId:null}],currency:{code:'EUR'}},{});
 assert.equal(defaults.currencyCode,'EUR'); assert.equal(defaults.lines[0].quantity,'2'); assert.equal(defaults.lines[0].description,'CNC');
 assert.equal(quoteLinesUntouched([{description:'Elle girildi',unitPrice:'',stockCode:''}]),false);
 assert.equal(quoteLinesUntouched([{description:'',unitPrice:'',stockCode:''}]),true);
});
