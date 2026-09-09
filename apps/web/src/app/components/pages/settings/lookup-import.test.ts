import { describe, expect, it } from 'vitest';
import { parseLookupCsv, previewLookupCsv, type LookupImportContext } from './lookup-import';
const context: LookupImportContext = {divisionId:'sac', divisions:[{id:'sac',code:'SAC_ISLEME',name:'Sac İşleme'},{id:'cnc',code:'CNC',name:'CNC'}], scoped:true, existing:[], parents:[{id:'parent',code:'TEZGAH',name:'Tezgah',divisionId:'sac'}], productTypes:[{id:'type',code:'FIBER_LAZER_KESIM',name:'Sac Lazer Kesim',divisionId:'sac'}], parentField:'categoryId', isSpecGroup:false};
describe('lookup CSV import', () => {
  it('reads BOM, quotes, multiline cells and exported hierarchy', () => {
    const rows = parseLookupCsv('\uFEFFAd;Sistem Kodu;Açıklama;Bölüm;Bağlı Olduğu Kategori\n"Lazer; Kesim";LASER;"Birinci\nİkinci";Sac İşleme;TEZGAH');
    expect(rows[0]).toMatchObject({name:'Lazer; Kesim',description:'Birinci\nİkinci',division:'Sac İşleme'});
    expect(previewLookupCsv(rows,context)[0]).toMatchObject({action:'create',errors:[],body:{parentId:'parent',divisionId:'sac'}});
  });
  it('updates matching scoped codes without removing omitted links or status', () => {
    const existing = [{id:'old',code:'LASER',name:'Eski',divisionId:'sac',categoryId:'parent'}];
    const [preview] = previewLookupCsv(parseLookupCsv('Ad;Kod\nYeni;LASER'),{...context,existing});
    expect(preview).toMatchObject({action:'update',existingId:'old',body:{name:'Yeni',parentId:'parent'}});
    expect(preview.body.isActive).toBeUndefined();
  });
  it('rejects unknown/mismatched departments and unmatched parents', () => {
    const rows=parseLookupCsv('Ad;Kod;Bölüm;Üst Kayıt\nA;A;YANLIS;TEZGAH\nB;B;CNC;TEZGAH\nC;C;Sac İşleme;YOK');
    const errors=previewLookupCsv(rows,context).map((row)=>row.errors.join(' '));
    expect(errors[0]).toContain('Bilinmeyen bölüm'); expect(errors[1]).toContain('farklı'); expect(errors[2]).toContain('bulunamadı');
  });
  it('maps technical group assignments and rejects missing product types', () => {
    const rows=parseLookupCsv('Ad;Kod;Ürün Tipleri\nGrup;GRUP;FIBER_LAZER_KESIM\nHatalı;BAD;YOK');
    const [good,bad]=previewLookupCsv(rows,{...context,parentField:undefined,isSpecGroup:true});
    expect(good.body.productTypeIds).toEqual(['type']); expect(good.errors).toEqual([]); expect(bad.errors.join(' ')).toContain('Ürün tipi eşleşmedi');
  });
  it('never updates shared records as selected-division records or accepts duplicates', () => {
    const rows=parseLookupCsv('Ad;Kod;Üst Kayıt\nA;A;TEZGAH\nA;A;TEZGAH');
    const preview=previewLookupCsv(rows,{...context,existing:[{id:'shared',code:'A',name:'A',divisionId:null}]});
    expect(preview[0].errors.join(' ')).toContain('Ortak kayıt'); expect(preview[1].errors.join(' ')).toContain('tekrarlanan');
  });
});
