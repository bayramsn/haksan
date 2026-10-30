import assert from 'node:assert/strict';
import test from 'node:test';
import { reserveProcessStock } from './reserve-stock.ts';
test('normal transition retains atomic server stock picking behavior', async () => {
  const calls=[];
  await reserveProcessStock('invoice', ['a','b'], async()=>calls.push('transition'), async(id)=>calls.push(id));
  assert.deepEqual(calls,['transition']);
});
test('already picking stock reserves every selected serial instead of a no-op transition', async () => {
  const calls=[];
  await reserveProcessStock('stock_picking', ['a','b'], async()=>calls.push('transition'), async(id)=>calls.push(id));
  assert.deepEqual(calls,['a','b']);
});
test('a failed reservation rejects and stops later writes', async () => {
  const calls=[];
  await assert.rejects(reserveProcessStock('stock_picking', ['a','b','c'], async()=>{}, async(id)=>{calls.push(id); if(id==='b') throw new Error('unavailable');}), /unavailable/);
  assert.deepEqual(calls,['a','b']);
});
