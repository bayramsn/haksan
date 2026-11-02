import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesOpportunityLocation, opportunityCity, opportunityRegion, regionCities, OPPORTUNITY_REGIONS } from './opportunity-location.ts';

test('firma ili lead ilinden önce gelir ve kanonik yazıma çevrilir', () => {
  assert.equal(opportunityCity({ leadCity: 'Ankara' }, ' IZMIR '), 'İzmir');
  assert.equal(opportunityCity({ leadCity: 'istanbul' }, null), 'İstanbul');
  assert.equal(opportunityCity({ leadCity: null }, ''), '');
});

test('il ve bölge süzgeci birlikte uygulanır; null süzgeç yok demektir', () => {
  assert.equal(opportunityRegion('Bursa'), 'Marmara');
  assert.equal(matchesOpportunityLocation('İzmir', null, null), true);
  assert.equal(matchesOpportunityLocation('izmir', 'İzmir', 'Ege'), true);
  assert.equal(matchesOpportunityLocation('İzmir', null, 'Marmara'), false);
  assert.equal(matchesOpportunityLocation('', 'Ankara', null), false);
});

test('81 il bölgelere tam bir kez dağılır', () => {
  const all = Object.values(OPPORTUNITY_REGIONS).flat();
  assert.equal(all.length, 81);
  assert.equal(new Set(all).size, 81);
  assert.equal(regionCities(null).length, 81);
  assert.deepEqual(regionCities('Ege').slice(0, 2), ['Afyonkarahisar', 'Aydın']);
});
