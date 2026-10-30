import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as hierarchy from './hierarchy.ts';
function back(pathname, hasHistory) {
  const calls = [];
  const router = { canGoBack: () => hasHistory, back: () => calls.push(['back']), replace: path => calls.push(['replace', path]) };
  const context = { exports: {}, require: name => name === 'expo-router' ? { useRouter: () => router, usePathname: () => pathname } : hierarchy };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./useHierarchyBack.ts', import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
  const navigation = context.exports.useHierarchyBack();navigation.goBack();return {calls,root:navigation.isTabRoot};
}
test('history preserves the actual previous screen',()=>assert.deepEqual(back('/modules/opportunities/o',true).calls,[['back']]));
test('cold opportunity and record details fall back to their lists',()=>{
  for(const module of ['opportunities','products','quotes','service-tickets','users'])assert.deepEqual(back(`/modules/${module}/record`,false).calls,[['replace',`/modules/${module}`]]);
});
test('cold conversation returns to chat, modal cancel returns home',()=>{
  assert.deepEqual(back('/chat/conversation',false).calls,[['replace','/chat']]);
  assert.deepEqual(back('/modal/task',false).calls,[['replace','/']]);
});
test('tab roots retain root presentation',()=>assert.equal(back('/companies',false).root,true));
