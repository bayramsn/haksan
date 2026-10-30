import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appleRouteUrl,
  centroidForProvince,
  coordsForCity,
  filterFirms,
  firmsWithoutExactPin,
  googleRouteUrl,
  haversineKm,
  locationQualityFor,
  mapFirms,
  normalizeTr,
  osmSourceFor,
  planRoute,
} from './geo.ts';

const row = (id, overrides = {}) => ({
  id,
  legalTitle: `Firma ${id}`,
  shortName: null,
  relationType: { code: 'customer' },
  primaryAddress: { province: 'Ankara', district: null, latitude: null, longitude: null, locationSource: null },
  ...overrides,
});

test('Türkçe karakter normalizasyonu ve il merkezi', () => {
  assert.equal(normalizeTr(' İstanbul '), 'istanbul');
  assert.deepEqual(centroidForProvince('izmir'), { lat: 38.423, lng: 27.143 });
  assert.equal(centroidForProvince('Atlantis'), null);
  const a = coordsForCity('Ankara', null, 'x');
  const b = coordsForCity('Ankara', null, 'x');
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.lat - 39.933) < 0.05);
});

test('haversine yaklaşık mesafe', () => {
  const km = haversineKm({ lat: 41.008, lng: 28.978 }, { lat: 39.933, lng: 32.859 });
  assert.ok(km > 340 && km < 360, String(km));
});

test('konum kalitesi ve OSM kaynağı', () => {
  assert.equal(locationQualityFor('manual'), 'exact');
  assert.equal(locationQualityFor('osm_street'), 'street');
  assert.equal(locationQualityFor(null), 'fallback');
  assert.equal(osmSourceFor('area'), 'osm_area');
});

test('koordinatsız firma il merkezine yerleşir, tanınmayan il haritadan çıkar', () => {
  const rows = [
    row('a', { primaryAddress: { province: 'Ankara', district: null, latitude: '39.9', longitude: '32.8', locationSource: 'manual' } }),
    row('b'),
    row('c', { primaryAddress: { province: 'Atlantis', district: null, latitude: null, longitude: null } }),
  ];
  const firms = mapFirms(rows, null);
  assert.deepEqual(firms.map((firm) => firm.id), ['a', 'b']);
  assert.equal(firms[0].locationQuality, 'exact');
  assert.equal(firms[1].locationQuality, 'fallback');
  assert.equal(firms[1].hasDbPin, false);
});

test('yarıçap filtresi aramada devre dışı, mesafeye göre sıralar', () => {
  const user = { lat: 41.008, lng: 28.978 };
  const rows = [
    row('ank', { relationType: { code: 'supplier' } }),
    row('ist', { primaryAddress: { province: 'İstanbul', district: null, latitude: null, longitude: null } }),
  ];
  const firms = mapFirms(rows, user);
  assert.deepEqual(filterFirms(firms, { firmType: 'all', radius: '50', search: '' }).map((f) => f.id), ['ist']);
  assert.deepEqual(filterFirms(firms, { firmType: 'all', radius: '50', search: 'firma' }).map((f) => f.id), ['ist', 'ank']);
  assert.deepEqual(filterFirms(firms, { firmType: 'supplier', radius: 'all', search: '' }).map((f) => f.id), ['ank']);
});

test('tam pini olmayan firmalar listesi', () => {
  const rows = [
    row('a', { primaryAddress: { province: 'Ankara', district: null, latitude: 1, longitude: 2, locationSource: 'verified' } }),
    row('b', { primaryAddress: { province: 'Ankara', district: null, latitude: 1, longitude: 2, locationSource: 'osm_area' } }),
    row('c'),
  ];
  assert.deepEqual(firmsWithoutExactPin(rows, { firmType: 'all', search: '' }).map((r) => r.id), ['b', 'c']);
});

test('rota en yakın komşu ile sıralanır ve km toplanır', () => {
  const start = { lat: 0, lng: 0 };
  const stops = [{ id: 'far', pos: { lat: 0, lng: 2 } }, { id: 'near', pos: { lat: 0, lng: 1 } }];
  const plan = planRoute(stops, start);
  assert.deepEqual(plan.ordered.map((stop) => stop.id), ['near', 'far']);
  assert.ok(Math.abs(plan.totalKm - haversineKm(start, { lat: 0, lng: 2 })) < 0.01);
  assert.equal(planRoute(stops, null).totalKm > 0, true);
  assert.deepEqual(planRoute([], start), { ordered: [], totalKm: 0 });
});

test('harita rota adresleri', () => {
  const points = [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }];
  assert.equal(googleRouteUrl(points), 'https://www.google.com/maps/dir/1.000000,2.000000/3.000000,4.000000');
  assert.equal(appleRouteUrl(points, true), 'http://maps.apple.com/?saddr=1.000000,2.000000&daddr=3.000000,4.000000&dirflg=d');
  assert.equal(appleRouteUrl(points, false), 'http://maps.apple.com/?daddr=1.000000,2.000000+to:3.000000,4.000000&dirflg=d');
  assert.equal(googleRouteUrl([]), null);
});
