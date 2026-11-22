import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeFairExportRequest } from './trade-fair-export.ts';
import { tradeFairListParams } from '../ui/trade-fairs/tradeFairLogic.ts';

test('fuar Excel ve PDF aynı liste filtreleriyle sunucu export uç noktasını kullanır', () => {
  const params = tradeFairListParams({ fairName: ' MAKTEK İstanbul ', q: ' Sac & CNC ', divisionId: 'division', metByUserId: 'staff', province: 'İstanbul', district: 'Büyükçekmece' });
  for (const format of ['xlsx', 'pdf']) {
    const result = tradeFairExportRequest(format, params);
    assert.equal(result.path, '/trade-fairs/export');
    assert.equal(result.filename, `fuar-gorusmeleri.${format}`);
    assert.deepEqual(result.query, { ...params, format });
  }
});

test('dışa aktarma yüklenen sayfa veya sayfa boyutu ile sınırlandırılmaz', () => {
  const result = tradeFairExportRequest('xlsx', { fairName: 'Fuar', page: 3, pageSize: 50, items: [{ id: 'one' }] });
  assert.equal(result.query.fairName, 'Fuar');
  for (const key of ['page', 'pageSize', 'items']) assert.equal(key in result.query, false);
});

test('tüm fuarlar ve boş filtreler desteklenir; il olmadan ilçe gönderilmez', () => {
  const params = tradeFairListParams({ fairName: null, q: '', divisionId: null, metByUserId: null, province: null, district: 'Önceki ilçe' });
  const result = tradeFairExportRequest('pdf', params);
  assert.equal(result.query.fairName, undefined);
  assert.equal(result.query.district, undefined);
  assert.equal(result.query.format, 'pdf');
});
