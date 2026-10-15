import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPickerValue, isSameDay, minuteSteps, monthGrid, roundToStep, shiftMonth, withDay, withTime } from './datetime-logic.ts';

test('ay ızgarası pazartesi başlar ve 42 gün içerir', () => {
  const grid = monthGrid(2026, 9);
  assert.equal(grid.length, 42);
  assert.equal(grid[0].date.getDay(), 1);
  assert.equal(grid.filter((day) => day.inMonth).length, 31);
  assert.equal(grid.find((day) => day.inMonth).date.getDate(), 1);
});

test('gün/saat birleştirme ve ay kaydırma', () => {
  const base = new Date(2026, 0, 31, 9, 15);
  assert.deepEqual(withTime(base, 14, 30), new Date(2026, 0, 31, 14, 30));
  assert.deepEqual(withDay(base, new Date(2026, 1, 2)), new Date(2026, 1, 2, 9, 15));
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
  assert.equal(isSameDay(new Date(2026, 0, 1, 1), new Date(2026, 0, 1, 23)), true);
  assert.equal(isSameDay(null, new Date()), false);
});

test('dakika adımları ve yuvarlama', () => {
  assert.deepEqual(minuteSteps(15), [0, 15, 30, 45]);
  assert.equal(minuteSteps(0).length, 60);
  assert.equal(roundToStep(new Date(2026, 0, 1, 10, 52), 15).getMinutes(), 45);
  assert.equal(roundToStep(new Date(2026, 0, 1, 10, 53), 15).getHours(), 11);
});

test('görüntü biçimi', () => {
  const date = new Date(2026, 2, 5, 7, 4);
  assert.equal(formatPickerValue(date, 'date'), '05.03.2026');
  assert.equal(formatPickerValue(date, 'datetime'), '05.03.2026 07:04');
  assert.equal(formatPickerValue(null, 'date'), '');
});
