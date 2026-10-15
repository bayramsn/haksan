import { describe, expect, it } from 'vitest';
import { HEX2026_SERIES } from '@haksan/shared';
import { invariantTechnical, planMissingTechnical, verifiedHexInvariant } from '../src/db/backfill-catalog-technical';
describe('additive technical repair', () => {
  it('fills blanks, preserves manual values and is idempotent', () => {
    const existing = [{ key: 'Motor', value: '9', unit: 'kW' }, { key: 'Tabla', value: '', unit: 'mm' }];
    const incoming = [{ key: 'Motor', value: '7', unit: 'kW' }, { key: 'Tabla', value: '200', unit: 'mm' }, { key: 'Strok', value: '50', unit: 'mm' }];
    const plan = planMissingTechnical(existing, incoming);
    expect(plan.conflicts.map(row => row.key)).toEqual(['Motor']);
    expect(plan.fills.map(row => row.key)).toEqual(['Tabla']);
    expect(plan.additions.map(row => row.key)).toEqual(['Strok']);
    const next = existing.map(row => plan.fills.find(fill => fill.key === row.key) ?? row).concat(plan.additions);
    expect(planMissingTechnical(next, incoming).additions).toEqual([]);
    expect(planMissingTechnical(next, incoming).fills).toEqual([]);
  });
  it('separates formatting differences from real unit conflicts without rewriting values', () => {
    const previous = [{ key: 'Motor', value: '1,3 kW', unit: '' }, { key: 'Capacity', value: '200', unit: 'kg' }];
    const incoming = [{ key: 'Motor', value: '1.3', unit: 'kW' }, { key: 'Capacity', value: '200', unit: 'mm' }];
    const plan = planMissingTechnical(previous, incoming);
    expect(plan.conflicts.map(row => row.key)).toEqual(['Capacity']);
    expect(plan.additions).toEqual([]);
    expect(plan.fills).toEqual([]);
    expect(previous[0].value).toBe('1,3 kW');
  });
  it('does not promote varying or missing configuration values to base facts', () => {
    const fixed = { key: 'Motor', value: '7', unit: 'kW' };
    expect(invariantTechnical([[fixed, { key: 'Boy', value: '1000', unit: 'mm' }], [fixed, { key: 'Boy', value: '1500', unit: 'mm' }]])).toEqual([fixed]);
    expect(invariantTechnical([[fixed], []])).toEqual([]);
    expect(invariantTechnical([[fixed], [fixed]], ['Motor'])).toEqual([]);
  });
  it('keeps selectable laser capacities and conditional PDF fields out of fixed base specs', () => {
    for (const series of HEX2026_SERIES) {
      for (const spec of verifiedHexInvariant(series)) {
        expect(spec.key).not.toMatch(/Lazer Gücü|Çalışma Alanı|Ekipman Boyutu|Kabin/);
        expect(series.configurations.every(config => config.fields.some(field => field.key === spec.key && field.rawValue === spec.value && field.verification === 'verified'))).toBe(true);
      }
    }
  });
});
