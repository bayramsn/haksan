import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url), ts=require('typescript');
function load(file,endpoints){
 const exports={}; const source=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,require:n=>n==='@tanstack/react-query'?{useInfiniteQuery:o=>o}:endpoints});
 return exports;
}
for(const [name,file,method,key] of [['tasks','./tasks.hooks.ts','useTaskList','tasks'],['price lists','./inventory.hooks.ts','usePriceLists','productsApi']]){
 test(name+' requests page on demand and ends at server totalPages',async()=>{
  const calls=[];const endpoint=key==='tasks'?'list':'priceLists';
  const hooks=load(file,{[key]:{[endpoint]:q=>{calls.push(q);return Promise.resolve({data:[],meta:{page:q.page,totalPages:3,total:101}})}}});
  const options=hooks[method]({view:'mine'});
  assert.equal(options.initialPageParam,1);
  assert.equal(calls.length,0);
  const page=await options.queryFn({pageParam:2});
  assert.equal(calls[0].page,2); assert.equal(calls[0].pageSize,50);
  assert.equal(options.getNextPageParam(page),3);
  assert.equal(options.getNextPageParam({meta:{page:3,totalPages:3}}),undefined);
 });
}
