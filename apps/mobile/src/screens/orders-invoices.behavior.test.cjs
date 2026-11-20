const fs = require('fs');
const vm = require('vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const ts = require(require.resolve('typescript', { paths: [root] }));
const assert = require('assert/strict');
function harness(file, services) {
  const values=[], effects=[], memo=[];
  let cursor=0, pending=true, tree, nextEffects=[];
  const same=(a,b)=>a && b && a.length===b.length && a.every((v,i)=>Object.is(v,b[i]));
  const hooks={
    useState(initial){const i=cursor++; if(!(i in values))values[i]=initial; return [values[i],v=>{const n=typeof v==='function'?v(values[i]):v;if(!Object.is(n,values[i])){values[i]=n;pending=true;}}];},
    useRef(initial){const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},
    useMemo(fn,deps){const i=cursor++;if(!memo[i]||!same(memo[i].deps,deps))memo[i]={value:fn(),deps};return memo[i].value;},
    useCallback(fn,deps){const i=cursor++;if(!memo[i]||!same(memo[i].deps,deps))memo[i]={fn,deps};return memo[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!effects[i]||!same(effects[i].deps,deps))nextEffects.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};});},
  };
  const jsx=(type,props)=>({type,props:type === 'FlatList' ? {...props,children:[props.ListHeaderComponent,...(props.data??[]).map((item,index)=>props.renderItem?.({item,index})),props.ListEmptyComponent,props.ListFooterComponent]} : type === 'Modal' && !props.visible ? {...props,children:null} : props||{}});
  const native=new Proxy({StyleSheet:{create:s=>s},Alert:{alert(){}}},{get:(o,k)=>o[k]??k});
  const sandbox={module:{exports:{}},exports:{},setTimeout,clearTimeout,Map,Number,Date,Error,Promise,console,require(name){
    if(services.__dependencies && Object.hasOwn(services.__dependencies,name))return services.__dependencies[name];
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='react-native')return native;
    if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};
    if(name==='@expo/vector-icons')return {Ionicons:'Icon'};
    if(name==='expo-router')return {router:{push(){},back(){}},useFocusEffect:fn=>hooks.useEffect(fn,[fn])};
    if(name.includes('/api/services'))return services;
    if(name.includes('/auth/AuthProvider'))return {useAuth:()=>({user:{permissions:services.__permissions ?? ['purchase_orders.create','purchase_orders.approve','purchase_orders.update'],roles:[]}})};
    throw Error(name);
  }};
  sandbox.exports=sandbox.module.exports;
  const output=ts.transpileModule(fs.readFileSync(path.join(root, file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(output,sandbox,{filename:file});
  const Component=Object.values(sandbox.module.exports)[0];
  const nodes=(node=tree)=>!node?[]:Array.isArray(node)?node.flatMap(n=>nodes(n)):typeof node==='object'?[node,...nodes(node.props?.children ?? null)]:[];
  const text=(node=tree)=>node==null?'':Array.isArray(node)?node.map(n=>text(n)).join(' '):typeof node==='object'?text(node.props?.children ?? null):String(node);
  return {async settle(){for(let pass=0;pass<25;pass++){if(pending){pending=false;cursor=0;nextEffects=[];tree=Component();for(const fn of nextEffects)fn();}await new Promise(resolve=>setImmediate(resolve));if(!pending)break;}},nodes,text,values};
}
module.exports = { harness };
if (require.main === module) (async()=>{
 let invoiceCalls=[];
 const first={id:'invoice-1',invoiceNo:'FAT-1',type:'sales',company:{legalTitle:'Ankara Makina'},grandTotal:'12',vatAmount:'2',currency:{code:'TRY'}};
 const second={id:'invoice-2',invoiceNo:'FAT-2',type:'purchase',company:{legalTitle:'İstanbul Metal'},grandTotal:'50',vatAmount:'10',currency:{code:'EUR'}};
 const inv=harness('apps/mobile/src/screens/AccountingInvoicesListScreen.tsx',{financeService:{accountingInvoices:async params=>{invoiceCalls.push(params);return {data:params.page===1?[first]:[second],total:2,page:params.page,pageSize:200};}}});
 await inv.settle();
 assert.equal(invoiceCalls.length,2,'invoice all pages read');
 assert.ok(inv.text().includes('İstanbul Metal'),'second page visible');
 assert.ok(inv.text().includes('12 TRY')&&inv.text().includes('50 EUR'),'original currencies preserved');
 assert.ok(!inv.text().includes('Ödendi'),'unavailable paid status not invented');
 inv.nodes().find(n=>n.type==='TextInput').props.onChangeText('istanbul');
 await inv.settle();
 assert.ok(inv.text().includes('İstanbul Metal')&&!inv.text().includes('Ankara Makina'),'Turkish search includes second page globally');
 const salesTab=inv.nodes().find(n=>n.type==='TouchableOpacity'&&inv.text(n)==='Satış');
 salesTab.props.onPress(); await inv.settle();
 assert.ok(invoiceCalls.some(c=>c.type==='sales'),'invoice server type filter');
 let poCalls=[];
 const po=harness('apps/mobile/src/screens/PurchaseOrdersListScreen.tsx',{purchaseOrderService:{list:async params=>{poCalls.push(params);return {data:[{id:'po-1',orderNo:'PO-1',supplier:{legalTitle:'Gerçek Tedarikçi'},grandTotal:'99',currency:{code:'USD'},status:{code:'draft',name:'Taslak'}}],meta:{total:2}};},approve:async()=>{},send:async()=>{}}});
 await po.settle();
 assert.ok(po.text().includes('Gerçek Tedarikçi')&&/99\s+USD/.test(po.text()),'purchase API row and currency');
 const more=po.nodes().find(n=>n.type==='TouchableOpacity'&&po.text(n).startsWith('Daha Fazla'));
 assert.ok(more); more.props.onPress(); await po.settle();
 assert.ok(poCalls.some(c=>c.page===2),'purchase pagination');
 const approvedTab=po.nodes().find(n=>n.type==='TouchableOpacity'&&po.text(n)==='Onaylı');
 approvedTab.props.onPress(); await po.settle();
 assert.equal(poCalls.at(-1).statusCode,'approved','purchase backend status code');
 assert.equal(poCalls.at(-1).page,1,'status change resets pagination');
 po.nodes().find(n=>n.type==='TextInput').props.onChangeText('PO-42');
 await po.settle();await new Promise(resolve=>setTimeout(resolve,320));await po.settle();
 assert.equal(poCalls.at(-1).search,'PO-42','purchase backend search');
 console.log('PASS: invoice pagination, Turkish all-page search, type filter, currencies; purchase CRM mapping, pagination, backend status/search/reset');
})().catch(error=>{console.error(error);process.exitCode=1;});
