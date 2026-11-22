import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as math from './reportMath.ts';
const source=ts.transpileModule(readFileSync(new URL('./target-history.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
const exports={};vm.runInNewContext(source,{exports,require:name=>{assert.equal(name,'./reportMath');return math;}});
const {collectTargetHistory,personTargetHistory,targetHistoryPeriods,targetRanks}=exports;
const row=(id,target,actual)=>({subject:{id,kind:'user',name:id},hasTarget:true,metrics:{phoneCalls:{target,actual,pct:Math.round(actual/target*100)}}});

test('history fetches January through selected month sequentially and never overlaps requests',async()=>{
 const calls=[];let active=0,max=0;
 const result=await collectTargetHistory('2026-03',async month=>{calls.push(month);active++;max=Math.max(max,active);await Promise.resolve();active--;return {subjects:[]};});
 assert.deepEqual(calls,['2026-01','2026-02','2026-03']);assert.equal(max,1);assert.equal(result.length,3);
 assert.equal(targetHistoryPeriods('2027-12').length,12);for(const value of ['2026-00','2026-13','bad'])assert.throws(()=>targetHistoryPeriods(value));
});

test('cancelled context or a failing month does not continue or return partial history',async()=>{
 let alive=true,calls=0;await assert.rejects(collectTargetHistory('2026-05',async()=>{calls++;alive=false;return {subjects:[]};},()=>alive));assert.equal(calls,1);
 calls=0;await assert.rejects(collectTargetHistory('2026-05',async()=>{calls++;if(calls===2)throw new Error('offline');return {subjects:[]};}),/offline/);assert.equal(calls,2);
});

test('trend keeps the last six months while YTD sums all targets and actuals and recalculates percentage',()=>{
 const history=Array.from({length:8},(_,i)=>({period:`2026-${String(i+1).padStart(2,'0')}`,subjects:[row('a',i===0?10:20,i===0?8:14)]}));
 history[3].subjects=[];
 const detail=personTargetHistory(history,'a');assert.equal(detail.periods.length,6);assert.equal(detail.periods[0],'2026-03');assert.equal(detail.percentages[1],null);
 assert.equal(detail.ytdMetrics[0].target,130);assert.equal(detail.ytdMetrics[0].actual,92);assert.equal(detail.ytdMetrics[0].pct,71);
});

test('team rank uses all measurable people before filtering, and does not mutate card order',()=>{
 const people=[['a',90],['b',50],['c',null],['d',90]].map(([id,pct])=>({row:{subject:{id}},analysis:{completionPct:pct}}));
 const ranks=targetRanks(people);assert.equal(ranks.get('b'),3);assert.equal(ranks.has('c'),false);assert.equal(ranks.get('a'),1);assert.equal(ranks.get('d'),2);assert.equal(people[0].row.subject.id,'a');
});
