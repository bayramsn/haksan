import assert from 'node:assert/strict';
import test from 'node:test';
import { recordDestination } from './tab-destination.ts';
test('saving from a root modal retains each originating tab', () => {
  const groups=['(home)','(companies)','(opportunities)','(calendar)','(modules)'];
  groups.forEach((name,index)=>assert.equal(recordDestination('/modules/quotes/record-id',{index:1,routes:[{name:'(tabs)',state:{index,routes:groups.map(name=>({name}))}},{name:'modal/quote-form'}]}),`/(tabs)/${name}/modules/quotes/record-id`));
});
test('direct links and unknown groups retain their original destination', () => {
  assert.equal(recordDestination('/modules/quotes/id'),'/modules/quotes/id');
  assert.equal(recordDestination('/modal/task',{routes:[{name:'(tabs)',state:{routes:[{name:'(modules)'}]}}]}),'/modal/task');
});
test('Expo root wrapper and multiple retained tab stacks use the latest underlying stack', () => {
  const tabs = index => ({name:'(tabs)',state:{index,routes:['(home)','(companies)','(opportunities)','(calendar)','(modules)'].map(name=>({name}))}});
  assert.equal(recordDestination('/modules/quotes/id',{index:0,routes:[{name:'__root',state:{index:2,routes:[tabs(0),tabs(4),{name:'modal'}]}}]}),'/(tabs)/(modules)/modules/quotes/id');
});
