import { describe, expect, it } from 'vitest';
import { resolveSettingsDivision, settingsDivisionKey } from './settings-division';

const divisions = [{ id: 'cnc', code: 'cnc' }, { id: 'sac', code: 'sac_isleme' }, { id: 'universal', code: 'universal' }];
describe('independent settings division', () => {
  it('prefers the saved settings choice over the application global division', () => {
    expect(resolveSettingsDivision(divisions, 'sac', 'cnc')).toBe('sac');
    expect(resolveSettingsDivision(divisions, 'sac', 'universal')).toBe('sac');
  });
  it('rejects unavailable divisions and all instead of creating shared records accidentally', () => {
    expect(resolveSettingsDivision(divisions, 'foreign', 'sac')).toBe('sac');
    expect(resolveSettingsDivision(divisions, 'all', 'all')).toBe('cnc');
    expect(resolveSettingsDivision([], 'sac')).toBe('');
  });
  it('keeps preferences separate per tenant and user', () => {
    expect(new Set([settingsDivisionKey('t1', 'u1'), settingsDivisionKey('t2', 'u1'), settingsDivisionKey('t1', 'u2')]).size).toBe(3);
  });
});
