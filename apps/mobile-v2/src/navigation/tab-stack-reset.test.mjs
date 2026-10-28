import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleResetTargets } from './tab-stack-reset.ts';
test('resets nested module details as well as profile/chat pushed above the catalog', () => {
  assert.deepEqual(moduleResetTargets({routes:[{name:'(home)'},{name:'(modules)',state:{key:'group',routes:[{name:'modules',state:{key:'catalog',routes:[{name:'index'},{name:'companies/[id]'}]}},{name:'more'}]}}]}),['catalog','group']);
});
test('unvisited tabs need no reset and other tab histories are left intact',()=>{
  assert.deepEqual(moduleResetTargets(undefined),[]);
  assert.deepEqual(moduleResetTargets({routes:[{name:'(home)',state:{key:'home',routes:[]}}]}),[]);
});
test('already-at-root stacks are skipped so POP_TO_TOP is never unhandled', () => {
  assert.deepEqual(moduleResetTargets({routes:[{name:'(modules)',state:{key:'group',routes:[{name:'modules',state:{key:'catalog',routes:[{name:'index'}]}}]}}]}),[]);
  assert.deepEqual(moduleResetTargets({routes:[{name:'(modules)',state:{key:'group',routes:[{name:'modules',state:{key:'catalog',routes:[{name:'index'}]}},{name:'more'}]}}]}),['group']);
});
