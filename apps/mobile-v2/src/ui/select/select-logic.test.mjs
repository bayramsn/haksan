import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterOptions, hasExactOption, normalizeSearch, provinceOptions } from './select-logic.ts';

const options = [
  { id: '1', label: 'İstanbul', hint: 'Kadıköy' },
  { id: '2', label: 'Iğdır' },
  { id: '3', label: 'Şanlıurfa' },
  { id: '4', label: 'CNC Torna', hint: 'HX-500 · Haksan' },
];

test('Türkçe büyük/küçük harf ve aksan duyarsız arar', () => {
  assert.equal(normalizeSearch('İSTANBUL'), 'istanbul');
  assert.equal(normalizeSearch('IĞDIR'), 'igdir');
  assert.deepEqual(filterOptions(options, 'istanbul').map((o) => o.id), ['1']);
  assert.deepEqual(filterOptions(options, 'igdir').map((o) => o.id), ['2']);
  assert.deepEqual(filterOptions(options, 'sanli').map((o) => o.id), ['3']);
});

test('her kelime etiket ya da ipucunda geçmeli', () => {
  assert.deepEqual(filterOptions(options, 'ist kad').map((o) => o.id), ['1']);
  assert.deepEqual(filterOptions(options, 'torna hx').map((o) => o.id), ['4']);
  assert.deepEqual(filterOptions(options, 'torna kad'), []);
});

test('boş arama tüm listeyi döner', () => {
  assert.equal(filterOptions(options, '   ').length, options.length);
});

test('elle yazma satırı yalnız birebir eşleşme yoksa gösterilir', () => {
  assert.equal(hasExactOption(options, 'istanbul'), true);
  assert.equal(hasExactOption(options, 'İstan'), false);
});

test('il listesi Türkçe sıralanır', () => {
  assert.deepEqual(provinceOptions(['Çorum', 'Ankara', 'Şırnak', 'Bursa']).map((o) => o.label), [
    'Ankara',
    'Bursa',
    'Çorum',
    'Şırnak',
  ]);
});

test('tarih metni yerel saatle gidip gelir', async () => {
  const { formatDateText, parseDateText } = await import('./select-logic.ts');
  const date = new Date(2026, 0, 5, 9, 7);
  assert.equal(formatDateText(date, 'date'), '2026-01-05');
  assert.equal(formatDateText(date, 'datetime'), '2026-01-05 09:07');
  assert.equal(parseDateText('2026-01-05 09:07').getTime(), date.getTime());
  assert.equal(parseDateText('2026-01-05').getHours(), 0);
  assert.equal(parseDateText('2026-02-31'), null);
  assert.equal(parseDateText(''), null);
});

test('adres metni açık adresi önceler, yoksa parçalardan kurar', async () => {
  const { addressText } = await import('./select-logic.ts');
  assert.equal(addressText({ fullAddress: '  OSB 5. Cad. No:3 ', province: 'Bursa' }), 'OSB 5. Cad. No:3');
  assert.equal(
    addressText({ fullAddress: null, street: 'Atatürk Cd.', buildingNumber: '12', district: 'Nilüfer', province: 'Bursa', country: 'Türkiye' }),
    'Atatürk Cd. 12, Nilüfer, Bursa, Türkiye',
  );
  assert.equal(addressText({ district: ' ', province: null }), '');
});

test('tekil değerler boşları atar ve Türkçe sıralanır', async () => {
  const { distinctValues } = await import('./select-logic.ts');
  assert.deepEqual(distinctValues(['Siemens 828D', ' FANUC 0i ', null, '', 'siemens 828d', 'Çin Kontrol']), ['Çin Kontrol', 'FANUC 0i', 'Siemens 828D']);
});

test('incoterm listesi tekil kodlar içerir', async () => {
  const { INCOTERMS } = await import('./select-logic.ts');
  const codes = INCOTERMS.map((row) => row.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of ['EXW', 'FOB', 'CIF', 'DAP']) assert.ok(codes.includes(code));
});

test('stok seri no seçenekleri kategori ve ürüne göre süzülür', async () => {
  const { matchesStockLine } = await import('./select-logic.ts');
  const tezgah = { product: { id: 'p1' }, category: { code: 'TEZGAH' } };
  const uncategorized = { product: { id: 'p2' }, category: null };
  const part = { product: { id: 'p3' }, category: { code: 'YEDEK_PARCA' } };
  assert.equal(matchesStockLine(tezgah, { categoryCode: 'TEZGAH' }), true);
  assert.equal(matchesStockLine(uncategorized, { categoryCode: 'TEZGAH' }), true);
  assert.equal(matchesStockLine(part, { categoryCode: 'TEZGAH' }), false);
  assert.equal(matchesStockLine(tezgah, { categoryCode: 'TEZGAH', productModelId: 'p2' }), false);
  assert.equal(matchesStockLine(tezgah, { productModelId: 'p1' }), true);
  assert.equal(matchesStockLine(part, {}), true);
});

test('virgüllü liste tekilleşir ve boşluklar temizlenir', async () => {
  const { joinTokens, splitTokens } = await import('./select-logic.ts');
  assert.deepEqual(splitTokens(' Bursa, istanbul ,, İstanbul ,BURSA'), ['Bursa', 'istanbul']);
  assert.equal(joinTokens(['Bursa', 'İzmir', 'bursa']), 'Bursa, İzmir');
  assert.deepEqual(splitTokens(''), []);
});
