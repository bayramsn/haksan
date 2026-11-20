import { expect, it } from 'vitest';
import { quoteItemCompatibilitySchema, type BaseModelConfiguration } from '@haksan/shared';
import { snapshotProductOptions, type CatalogOptionRow } from '../src/modules/quotes/quote-product-options';
const id = '00000000-0000-4000-8000-000000000001';
const value = '00000000-0000-4000-8000-000000000002';
const base: BaseModelConfiguration = {kind:'universal',baseModelCode:'CD6241',sourceModelCodes:['CD6241/1000'],variableSpecKeys:['length'],sourceRevision:'v1',configurations:[{sourceModelCode:'CD6241/1000',sourceProductId:id,specs:[{key:'length',value:'1000',unit:'mm'}]}]};
const option: CatalogOptionRow = {optionSetId:id,optionValueId:value,name:'Uzunluk',value:'1000 mm',priceDelta:50,currencyCode:'EUR',configurationKind:null,sourceModelCode:'CD6241/1000',powerKw:null,cabinType:null};
const input = () => quoteItemCompatibilitySchema.parse({technicalSpecs:[{key:'length',value:'9999',unit:'mm'},{key:'manual',value:'keep'}], selectedProductOptions:[{optionSetId:id,optionValueId:value,priceDelta:50,currencyCode:'EUR'}]});
it('hydrates verified variable dimensions and preserves independent manual fields',()=>{
 const result=snapshotProductOptions(input(),[option],[id],null,base);
 expect(result.technicalSpecs).toEqual([{key:'manual',value:'keep'},{key:'length',value:'1000',unit:'mm'}]);
});
it('rejects unrelated source models and omitted required dimensions',()=>{
 expect(()=>snapshotProductOptions(input(),[{...option,sourceModelCode:'Other'}],[id],null,base)).toThrow('baz makineye ait değil');
 expect(()=>snapshotProductOptions(quoteItemCompatibilitySchema.parse({}),[option],[id],null,base)).toThrow('seçeneklerini tamamlayın');
});
it('preserves missing-price validation for universal options',()=>{
 expect(()=>snapshotProductOptions(input(),[{...option,priceDelta:null}],[id],null,base)).toThrow('ek fiyatını');
});
