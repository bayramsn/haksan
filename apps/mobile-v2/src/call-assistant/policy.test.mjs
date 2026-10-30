import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./policy.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, Date });
const { parseCommand, previewPendingAction, validPending, PENDING_TTL, dialablePhone } = exports;
const now = new Date(2026, 9, 27, 9, 0);

test('Turkish example commands retain customer hints and explicit spoken clocks', () => {
  assert.equal(parseCommand('ABC Makina fırsatlarını aç', now).query, 'ABC Makina');
  assert.equal(parseCommand('ABC Makina için yeni fırsat hazırla', now).action, 'new_opportunity');
  assert.equal(parseCommand('Ahmet Bey’e görüşme notu ekle', now).query, 'Ahmet Bey');
  assert.equal(parseCommand('Ahmet Bey’e yarın saat onda takip görevi hazırla', now).query, 'Ahmet Bey');
  assert.equal(parseCommand('Bu müşteriye servis talebi hazırla', now).query, '');
  for (const [command, hours, minutes] of [
    ['Yarın saat onda takip görevi hazırla', 10, 0],
    ['Yarın saat on birde takip görevi hazırla', 11, 0],
    ['Yarın saat on buçukta takip görevi hazırla', 10, 30],
    ['Yarın saat 10:45 takip görevi hazırla', 10, 45],
    ['Yarın akşam saat beşte takip görevi hazırla', 17, 0],
  ]) {
    const result = parseCommand(command, now);
    const date = new Date(result.dueAt);
    assert.equal(date.getDate(), 28, command);
    assert.equal(date.getHours(), hours, command);
    assert.equal(date.getMinutes(), minutes, command);
    assert.equal(result.needsDate, false);
  }
});

test('ambiguous, invalid and past clocks require review; prohibited commands never execute', () => {
  for (const command of ['Yarın takip hazırla', 'Yarın saat 25 takip hazırla', 'Yarın saat 10:75 takip hazırla', 'Bugün saat 8 takip hazırla', 'Yarın saat on çeyrek geçe takip hazırla']) {
    const parsed = parseCommand(command, now);
    assert.equal(parsed.dueAt, undefined, command);
    assert.equal(parsed.needsDate, true, command);
  }
  for (const command of ['Fırsatı sil', 'Ödeme yap', 'Fiyat değiştir', 'Belgeyi kesinleştir']) assert.equal(parseCommand(command, now).action, null);
});

test('native handoffs enforce account, expiry and typed optional payloads', () => {
  const action = { id: '12345678-1234-4123-8123-123456789012', action: 'post_call', scope: 'account-a', createdAt: now.getTime(), phoneNumber: '+905321234567' };
  assert.equal(validPending(action, 'account-a', now.getTime()), true);
  for (const change of [{ scope: 'account-b' }, { createdAt: now.getTime() - PENDING_TTL - 1 }, { action: 'delete' }, { text: 0 }, { command: false }, { command: 'a'.repeat(2001) }, { query: 'a'.repeat(301) }, { dueAt: 'tomorrow' }, { dueAt: 5 }, { phoneNumber: '123' }, { direction: 'unknown' }, { eventType: 'answered' }]) assert.equal(validPending({ ...action, ...change }, 'account-a', now.getTime()), false);
  assert.equal(validPending({ ...action, command: 'ABC Makina fırsatlarını aç', query: 'ABC Makina', dueAt: '2026-10-28T10:00:00Z' }, 'account-a', now.getTime()), true);
});

test('Siri full command resolves allowed action, customer hint and spoken date for review', () => {
  const pending = { action: 'after_call', command: 'ABC Makina fırsatlarını aç' };
  const found = previewPendingAction(pending, now);
  assert.equal(found.action, 'find_opportunities'); assert.equal(found.query, 'ABC Makina');
  const task = previewPendingAction({ ...pending, command: 'Yarın saat onda takip görevi hazırla' }, now);
  assert.equal(task.action, 'create_task'); assert.equal(new Date(task.dueAt).getHours(), 10); assert.equal(task.needsDate, false);
  assert.equal(previewPendingAction({ ...pending, command: 'Bugünkü işlerimi aç' }, now).action, 'open_today');
  for (const command of ['Fırsatı sil', 'Ödeme yap', 'Fiyat değiştir', 'Belgeyi kesinleştir', 'rastgele metin']) {
    const rejected = previewPendingAction({ ...pending, command }, now); assert.equal(rejected.action, null); assert.ok(rejected.error);
  }
});

test('typed Siri query/date and legacy note are preserved without silently choosing a customer', () => {
  const note = previewPendingAction({ action: 'add_note', text: 'Müşteri yarın arayacak.', query: 'Ahmet Bey' }, now);
  assert.equal(note.query, 'Ahmet Bey'); assert.equal(note.text, 'Müşteri yarın arayacak.');
  assert.equal(previewPendingAction({ action: 'add_note', text: 'Müşteri yarın arayacak.' }, now).query, '');
  const dueAt = new Date(2026, 9, 28, 10).toISOString();
  const task = previewPendingAction({ action: 'create_task', query: 'ABC Makina', dueAt }, now);
  assert.equal(task.dueAt, dueAt); assert.equal(task.query, 'ABC Makina'); assert.equal(task.needsDate, false);
  for (const invalid of ['bad', '2020-01-01T10:00:00Z']) {
    const task = previewPendingAction({ action: 'create_task', dueAt: invalid }, now); assert.equal(task.dueAt, undefined); assert.equal(task.needsDate, true);
  }
  assert.equal(previewPendingAction({ action: 'new_opportunity', dueAt }, now).dueAt, undefined);
});

test('çoklu/dahili numarada ilk aranabilir numara seçilir, numaralar birleşmez', () => {
  assert.equal(dialablePhone('0532 123 45 67 / 0212 555 44 33'), '05321234567');
  assert.equal(dialablePhone('+90 212 555 44 33 dahili 12'), '+902125554433');
  assert.equal(dialablePhone('(0212) 555-44-33'), '02125554433');
  assert.equal(dialablePhone('yok'), null);
});
