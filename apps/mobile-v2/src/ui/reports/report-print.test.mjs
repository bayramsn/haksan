import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as math from './reportMath.ts';
import { printDocument } from '../../native/print-document.ts';
const source = ts.transpileModule(readFileSync(new URL('./report-print.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const exports = {};
vm.runInNewContext(source, { exports, require: name => { assert.equal(name, './reportMath'); return math; } });
const { operationalReportPrint, yearEndReportPrint, targetReportPrint } = exports;
const fx = { rateDate: '2026-11-01', source: 'fallback', live: false, unsupportedCurrencies: ['XYZ'] };

test('operational PDF preserves selected scope, every period, totals and fallback exchange-rate warning', () => {
  const rows = Array.from({length:12}, (_,i) => ({ bucket:`2026-${String(i+1).padStart(2,'0')}`, quotes:2,approved:1,rejected:0,won:1,lost:0,service:3,revenueUsd:100 }));
  const doc = operationalReportPrint({rows,currencyNormalization:fx},{period:'monthly',year:2026},{ownerName:'<script>Alice</script>',departmentName:'Satış'});
  assert.ok(doc.subtitle.includes('2026')); assert.ok(doc.subtitle.includes('Satış'));
  const table=doc.sections.find(s=>s.table).table; assert.equal(table.rows.length,13); assert.equal(table.rows.at(-1)[1],24); assert.equal(table.rows.at(-1)[6],36);
  const html=printDocument(doc); assert.ok(html.includes('Ara')); assert.ok(html.includes('Yedek kur')); assert.ok(html.includes('XYZ')); assert.ok(html.includes('&lt;script&gt;Alice')); assert.ok(!html.includes('<script>'));
});

test('year-end PDF contains all six web detail tables without silently truncating representatives', () => {
  const doc=yearEndReportPrint({year:2026,summary:{total:100,won:20,lost:10,cancelled:5,open:65,winRate:66,lossRate:33,avgWonValue:'20',avgLostValue:'10',avgQuoteValue:'15',openValue:'999'},lostReasons:[{name:'Bütçe',count:1,value:'100'}],wonReasons:[{reason:'Kalite',count:2,value:'200'}],competitors:[{name:'Rakip',count:1,value:'100'}],quotesByStatus:[{name:'Taslak',count:2,totalValue:'250',avgValue:'125'}],monthly:[{month:'2026-11',won:1,lost:2,wonValue:'500',lostValue:'100'}],byUser:Array.from({length:120},(_,i)=>({name:`Temsilci ${i}`,total:i,won:1,lost:0,wonValue:'100'}))});
  assert.equal(doc.sections.filter(s=>s.table).length,6); assert.equal(doc.sections.at(-1).table.rows.length,120);
  const html=printDocument(doc); for(const text of ['Temsilci 119','Aylık Trend','Kazanma Nedenleri','Kaybetme Nedenleri','Rakip Kaybı','Teklif Fiyat Ortalamaları'])assert.ok(html.includes(text));
});

test('target PDF retains manual goals, notes, invoice contributors and previous percentage for filtered people',()=>{
 const row={subject:{kind:'user',id:'u1',name:'Alice',departmentId:'d1',departmentName:'Servis'},hasTarget:true,note:'<img src="https://outside">',topSales:[{label:'ABC · FAT-1',amount:250,currency:'EUR'}]};
 const person={row,analysis:{status:'at_risk',completionPct:20,metrics:[{label:'Görüşme',target:10,actual:2,pct:20,unit:'adet'}],manual:[{label:'Eğitim',target:'Ürün eğitimi'}]},previousPct:45};
 const doc=targetReportPrint({period:'2026-11',departmentName:'Servis',problemsOnly:true,expectedPct:80,averagePct:20,daysLeft:4,teamMetrics:person.analysis.metrics,noTargetNames:[],people:[person],scopedPeople:[person],departments:[],fx});
 const html=printDocument(doc); for(const text of ['Alice','Servis','Eksik / riskli','Ürün eğitimi','ABC · FAT-1','EUR','%45'])assert.ok(html.includes(text)); assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img'));
});
test('personal target output excludes other people and team notes but retains history, YTD and global rank',()=>{
 const person=id=>({row:{subject:{kind:'user',id,name:id},hasTarget:true},analysis:{status:'on_track',completionPct:70,metrics:[],manual:[]},previousPct:50});
 const alice=person('Alice'),bob=person('Bob');
 const doc=targetReportPrint({period:'2026-03',departmentName:'Takım',problemsOnly:false,expectedPct:60,averagePct:75,daysLeft:2,teamMetrics:[{label:'TeamSecret',actual:4,target:5,pct:80,unit:'adet'}],noTargetNames:['Bob'],people:[alice,bob],scopedPeople:[alice,bob],departments:[],focusPersonId:'Alice',ranks:new Map([['Alice',2]]),history:{Alice:{periods:['2026-02','2026-03'],percentages:[null,70],ytdMetrics:[{label:'Görüşme',actual:22,target:30,pct:73,unit:'adet'}]}}});
 const html=printDocument(doc);assert.ok(html.includes('Alice'));assert.ok(!html.includes('Bob'));assert.ok(!html.includes('TeamSecret'));assert.ok(html.includes('Yıl başından seçili döneme'));assert.ok(html.includes('(%73)'));assert.ok(html.includes('Ekip sırası'));assert.ok(html.includes('Şubat'));assert.ok(html.includes('Kişisel'));
});
