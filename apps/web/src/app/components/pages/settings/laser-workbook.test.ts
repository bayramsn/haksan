import { describe, expect, it } from 'vitest';
import { resolveLaserProfile } from '@haksan/shared';
import { laserWorkbookRows, laserWorkbookSpecs } from './laser-workbook';
const configuration = () => resolveLaserProfile({productTypeCode:'FIBER_LAZER_KESIM',series:'F',cabinType:'open',powerKw:6,sourceModelCode:'F3015'});
describe('common technical workbook laser values', () => {
  it('preserves original source metadata when editing values and units', () => {
    const rows=laserWorkbookRows(configuration());
    const row=rows.find((item)=>item.specKey==='Makine Ağırlığı') ?? rows[1];
    const source=row.laserSource!; row.defaultValue='999'; row.unit='kg';
    const spec=laserWorkbookSpecs([row])[0];
    expect(spec).toMatchObject({value:'999',unit:'kg',source:source.source,sourceValue:source.value,isManual:true});
  });
  it('sends only visible rows in workbook order and supports renamed/new fields', () => {
    const rows=laserWorkbookRows(configuration()).slice(0,3); rows[1].isDeleted=true; rows[2].specKey='Özel Alan';
    const output=laserWorkbookSpecs([rows[2],rows[1],rows[0]]);
    expect(output.map((spec)=>spec.key)).toEqual(['Özel Alan',rows[0].specKey]); expect(output[0].isManual).toBe(true);
    expect(rows.every((row)=>!row.inCatalog)).toBe(true);
  });
});
