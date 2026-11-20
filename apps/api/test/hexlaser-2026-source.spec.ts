import { describe, expect, it } from 'vitest';
import { HEX2026_REVISION, HEX2026_SERIES, resolveLaserProfile, laserSelectionSchema, laserBaseConfigurationSchema, hex2026ProductType } from '@haksan/shared';
describe('HEX 2026 exact source resolution', () => {
 it('contains 17 series, exact model columns and page provenance without inferred ranged power choices', () => {
  expect(HEX2026_SERIES).toHaveLength(17);
  expect(HEX2026_SERIES.reduce((n,s)=>n+s.configurations.length,0)).toBe(60);
  for(const row of HEX2026_SERIES) for(const model of row.configurations) for(const field of model.fields) {
   expect(field.source.page).toBeGreaterThan(0); expect(field.source.sourceModelCode).toBe(model.sourceModelCode); expect(field.source.rawValue).toBe(field.rawValue);
  }
  expect(HEX2026_SERIES.filter(row=>row.series!=='HW').every(row=>!row.powerOptions.length)).toBe(true);
  expect(HEX2026_SERIES.find(row=>row.series==='HW')?.powerOptions).toEqual([1.5,2,3]);
 });
 it('uses PDF working area rather than workbook or conflicting AORE dimensions', () => {
  const resolved=resolveLaserProfile({ sourceRevision:HEX2026_REVISION,series:'F',sourceModelCode:'F-6020',productTypeCode:'FIBER_LAZER_KESIM',cabinType:'open',powerKw:6 });
  expect(resolved.specs.find(field=>field.key==='Çalışma Alanı (mm)')?.value).toBe('6050x2030');
  expect(resolved.sourceRevision).toBe(HEX2026_REVISION);
  expect(resolved.issues.some(issue=>issue.code==='manual_power_review')).toBe(true);
 });
 it('validates every manifest series including PU through public schemas', () => {
  for (const row of HEX2026_SERIES) {
   expect(laserBaseConfigurationSchema.safeParse({sourceRevision:HEX2026_REVISION,familyCode:row.series,series:row.series,productTypeCode:hex2026ProductType(row),sourceModelCodes:row.configurations.map(model=>model.sourceModelCode)}).success,row.series).toBe(true);
   for(const model of row.configurations) expect(laserSelectionSchema.safeParse({sourceRevision:HEX2026_REVISION,series:row.series,productTypeCode:hex2026ProductType(row),sourceModelCode:model.sourceModelCode,powerKw:3,cabinType:row.standardCabin??'open'}).success,model.sourceModelCode).toBe(true);
  }
 });
 it('rejects guessed aliases and mismatched product types', () => {
  expect(laserSelectionSchema.safeParse({ sourceRevision:HEX2026_REVISION,series:'F',sourceModelCode:'F6020',productTypeCode:'FIBER_LAZER_KESIM',cabinType:'open',powerKw:6 }).success).toBe(false);
  for(const row of HEX2026_SERIES) expect(hex2026ProductType(row)).toBeTruthy();
 });
});
