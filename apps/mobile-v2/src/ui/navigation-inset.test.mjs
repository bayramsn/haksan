import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationBottomInset } from './navigation-inset.ts';
test('native navbar clearance follows OS, orientation and physical safe area', () => {
  assert.equal(navigationBottomInset({platform:'ios',version:26,bottom:34,landscape:false}),96);
  assert.equal(navigationBottomInset({platform:'ios',version:18,bottom:34,landscape:false}),83);
  assert.equal(navigationBottomInset({platform:'ios',version:26,bottom:21,landscape:true}),53);
  assert.equal(navigationBottomInset({platform:'ios',version:18,bottom:0,landscape:false}),49);
});
test('classic tabs reserve layout space instead of adding a second content gap', () => {
  for(const platform of ['android','web']) assert.equal(navigationBottomInset({platform,version:36,bottom:24,landscape:false}),0);
});
