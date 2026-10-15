import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isTabRootPath, parentPath } from './hierarchy.ts';

const source = readFileSync(new URL('./catalog.ts', import.meta.url), 'utf8');
const modulesDir = new URL('../../app/(tabs)/modules/', import.meta.url);
const seedBlock = source.slice(source.indexOf('const seeds'), source.indexOf('/** Rota anahtardan'));
const entries = [...seedBlock.matchAll(/key: '([^']+)',\s*title: '([^']+)'[\s\S]*?group: '([^']+)'/g)].map(([, key, title, group]) => ({ key, title, group }));
const groupOrder = [...source.matchAll(/\{ key: '([^']+)', title: '[^']+', hint:/g)].map(([, key]) => key);

test('katalog web menü gruplarını aynı sırayla izler', () => {
  assert.deepEqual(groupOrder, ['general', 'sales', 'sales-ops', 'operations', 'service', 'admin']);
  for (const entry of entries) assert.ok(groupOrder.includes(entry.group), `${entry.key} bilinmeyen grupta`);
  const firstIndex = entries.map((entry) => groupOrder.indexOf(entry.group));
  assert.deepEqual(firstIndex, [...firstIndex].sort((a, b) => a - b), 'girişler grup sırasına göre dizilmeli');
});

test('her katalog girişi var olan bir liste ekranına gider', () => {
  assert.ok(entries.length > 30);
  assert.equal(new Set(entries.map((entry) => entry.key)).size, entries.length, 'anahtarlar benzersiz olmalı');
  for (const { key } of entries) {
    assert.ok(existsSync(new URL(`${key}/index.tsx`, modulesDir)), `${key}/index.tsx yok`);
  }
});

test('her modül klasörü katalogdan erişilebilir', () => {
  const keys = new Set(entries.map((entry) => entry.key));
  const folders = readdirSync(modulesDir, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
  assert.deepEqual(folders.filter((folder) => !keys.has(folder)), []);
});

test('liste başlığı katalog adıyla aynı', () => {
  for (const { key, title } of entries) {
    const screen = readFileSync(new URL(`${key}/index.tsx`, modulesDir), 'utf8');
    if (!screen.includes('<ScreenHeader')) continue;
    const titles = [...screen.matchAll(/<ScreenHeader\s+title="([^"]+)"/g)].map(([, value]) => value);
    for (const value of titles) assert.equal(value, title, `${key} ekran başlığı`);
  }
});

test('hiyerarşi: sekme kökünde geri yok, geçmiş yoksa bir üst seviye', () => {
  for (const root of ['/', '/companies', '/opportunities', '/calendar', '/more']) assert.equal(isTabRootPath(root), true);
  for (const nested of ['/modules', '/modules/companies', '/chat', '/notifications', '/more/settings']) assert.equal(isTabRootPath(nested), false);
  assert.equal(parentPath('/modules/companies/42'), '/modules/companies');
  assert.equal(parentPath('/modules/documents/proforma/42'), '/modules/documents');
  assert.equal(parentPath('/modules/balances/c-1'), '/modules/balances');
  assert.equal(parentPath('/modules/kanban'), '/modules');
  assert.equal(parentPath('/modules'), '/');
  assert.equal(parentPath('/more/settings/lookups/sectors'), '/more/settings/lookups');
  assert.equal(parentPath('/more/settings'), '/more');
  assert.equal(parentPath('/chat/abc'), '/chat');
  assert.equal(parentPath('/modal/task'), '/');
});
