import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModuleMenu } from './module-menu.ts';

const entry = (key, navKey, group, title = key) => ({ key, navKey, group, title, route: `/modules/${key}` });
test('web kategori sırası ve başlıkları kullanılır; rapor ve yönetim en sonda kalır', () => {
  const groups = buildModuleMenu([
    entry('reports', 'reports', 'admin'), entry('inventory', 'stock', 'catalog'),
    entry('quotes', 'offers', 'sales-ops'), entry('tasks', 'tasks', 'general'),
    entry('service-tickets', 'service-requests', 'service'), entry('companies', 'customers', 'sales'),
  ]);
  assert.deepEqual(groups.map((group) => group.title), ['Genel', 'Satış', 'Satış Operasyonu', 'Operasyon', 'Servis', 'Yönetim']);
  assert.equal(groups[2].entries[0].title, 'Teklifler');
});
test('canonical aliaslar web alanına düşer; ayrı mobil rota ve adlar korunur', () => {
  const groups = buildModuleMenu([
    entry('deliveries', 'deliveries', 'logistics', 'Teslimat Kayıtları'),
    entry('contracts', 'contracts', 'sales-ops', 'Sözleşmeler'),
    entry('kanban', 'kanban', 'sales', 'Fırsat Kanbanı'),
  ]);
  assert.deepEqual(groups.map((group) => group.title), ['Satış', 'Satış Operasyonu', 'Servis']);
  assert.equal(groups[0].entries[0].title, 'Fırsat Kanbanı');
  assert.equal(groups[2].entries[0].route, '/modules/deliveries');
});
test('mobile özel modüller kaybolmaz ve girişler çoğaltılmaz', () => {
  const entries = [entry('activities', undefined, 'general'), entry('targets', undefined, 'sales'), entry('purchase-orders', undefined, 'catalog'), entry('receivables', 'receivables', 'finance'), entry('maintenance-plans', undefined, 'service')];
  const result = buildModuleMenu(entries).flatMap((group) => group.entries);
  assert.deepEqual(new Set(result.map((item) => item.key)), new Set(entries.map((item) => item.key)));
  assert.equal(result.length, entries.length);
  assert.deepEqual(entries[0], entry('activities', undefined, 'general'));
});
test('arama web başlığı, eski mobil adı ve Türkçe kategori adıyla eşleşir', () => {
  const entries = [entry('documents', 'documents', 'sales-ops', 'Ticari Belgeler'), entry('inventory', 'stock', 'catalog', 'Stoklar')];
  assert.equal(buildModuleMenu(entries, 'TİCARİ BELGE MERKEZİ')[0].entries[0].key, 'documents');
  assert.equal(buildModuleMenu(entries, 'Stoklar')[0].entries[0].key, 'inventory');
  assert.equal(buildModuleMenu(entries, 'satış operasyonu')[0].entries[0].key, 'documents');
  assert.deepEqual(buildModuleMenu(entries, 'bulunmayan'), []);
});
test('yalnız verilen izinli girişleri gösterir ve boş kategori üretmez', () => {
  assert.deepEqual(buildModuleMenu([]), []);
  const groups = buildModuleMenu([entry('tasks', 'tasks', 'general')]);
  assert.deepEqual(groups.map((group) => group.title), ['Genel']);
  assert.equal(groups[0].entries.length, 1);
});
