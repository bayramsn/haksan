import test from 'node:test';
import assert from 'node:assert/strict';
import { maintenancePlanInput } from './maintenance-plan.ts';
test('maintenance rejects impossible dates and out-of-contract intervals', () => {
  for (const date of ['2026-02-30','2025-02-29','2026-13-01','2026-00-01','2026-01-00','abc']) assert.throws(() => maintenancePlanInput('180',date));
  for (const interval of ['0','-1','3651','1.5','NaN']) assert.throws(() => maintenancePlanInput(interval,''));
});
test('maintenance retains valid calendar dates and optional due date', () => {
  assert.deepEqual(maintenancePlanInput('',''),{intervalDays:180});
  const result=maintenancePlanInput('3650','2028-02-29');
  assert.equal(result.intervalDays,3650);
  const date=new Date(result.nextDueDate);assert.equal(date.getFullYear(),2028);assert.equal(date.getMonth(),1);assert.equal(date.getDate(),29);
});
