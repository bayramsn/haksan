const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness } = require('./orders-invoices.behavior.test.cjs');
const root = path.resolve(__dirname, '../../../..');
const ts = require(require.resolve('typescript', { paths: [root] }));
const calls=[];
const qs = params => { const out = new URLSearchParams(); for (const [key,value] of Object.entries(params??{})) if(value!==undefined&&value!==null&&value!=='')out.set(key,String(value)); return out.size?`?${out}`:''; };
const sandbox={exports:{},require(name){if(name==='./apiClient')return {api:{get:async url=>{calls.push(url);return {};}}};if(name==='./qs')return {qs};throw Error(name);}};
const source=fs.readFileSync(path.join(root,'apps/mobile/src/api/tradeFairs.ts'),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
const api=sandbox.exports;
(async()=>{
 assert.equal(new Set(api.TRADE_FAIR_PROVINCES).size,81);
 const webSource=fs.readFileSync(path.join(root,'apps/web/src/app/lib/geo.ts'),'utf8').split('const PROVINCES:')[1].split('];')[0];
 const webNames=[...webSource.matchAll(/\["([^"]+)",/g)].map(match=>match[1]);
 assert.deepEqual([...api.TRADE_FAIR_PROVINCES].sort(),webNames.sort(),'all 81 cities match web');
 await api.tradeFairsService.list({q:'Ankara',fairName:'Fuar A',province:'Ankara',metByUserId:'user-1',page:2,pageSize:50});
 await api.tradeFairsService.summary('Fuar A');await api.tradeFairsService.staff();
 assert.equal(calls[0],'/trade-fairs?q=Ankara&fairName=Fuar+A&province=Ankara&metByUserId=user-1&page=2&pageSize=50');
 assert.equal(calls[1],'/trade-fairs/summary?fairName=Fuar+A');assert.equal(calls[2],'/trade-fairs/staff');
 const listCalls=[],exports=[];
 const employee='10000000-0000-4000-8000-000000000001';
 const row={id:'row1',companyName:'Ankara Firma',contactName:'Gerçek Yetkili',fairName:'Fuar A',province:'Ankara',country:'Türkiye',metByName:'Çalışan',visitorCount:2};
 const app=harness('apps/mobile/src/screens/TradeFairsScreen.tsx',{
  __permissions:['trade_fairs.read','reports.export'],
  __dependencies:{
   '@/src/api/tradeFairs':{...api,tradeFairsService:{list:async params=>{listCalls.push(params);return {data:[row],meta:{total:2}};},summary:async()=>({fairs:[{name:'Fuar A',total:2}],byUser:[{userId:employee,fullName:'Çalışan',meetings:2,people:3}]}),staff:async()=>[{id:employee,fullName:'Çalışan'}]}},
   '@/src/api/download':{openExportUrl:async path=>exports.push(path),openStoredFile:async()=>{}},
  },fileService:{links:async()=>({data:[],meta:{total:0}})},
 });
 await app.settle();
 assert.ok(app.text().includes('Ankara Firma'),'real CRM row rendered');
 const staffCard=app.nodes().find(n=>n.type==='TouchableOpacity'&&app.text(n).includes('Çalışan')&&app.text(n).includes('kayıt'));
 assert.ok(staffCard);staffCard.props.onPress();await app.settle();
 assert.equal(listCalls.at(-1).metByUserId,employee,'staff click filters their entries');
 const cityButton=app.nodes().find(n=>n.type==='TouchableOpacity'&&app.text(n).includes('Tüm Şehirler'));
 cityButton.props.onPress();await app.settle();
 const ankara=app.nodes().find(n=>n.type==='TouchableOpacity'&&app.text(n)==='Ankara');
 assert.ok(ankara);ankara.props.onPress();await app.settle();assert.equal(listCalls.at(-1).province,'Ankara');
 app.nodes().find(n=>n.type==='TouchableOpacity'&&app.text(n)==='Tüm Fuarlar').props.onPress();await app.settle();
 app.nodes().find(n=>n.type==='TouchableOpacity'&&app.text(n)==='Fuar A').props.onPress();await app.settle();
 assert.equal(listCalls.at(-1).fairName,'Fuar A');
 app.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Fuar kayıtlarında ara').props.onChangeText('Firma');await app.settle();await new Promise(resolve=>setTimeout(resolve,320));await app.settle();
 assert.equal(listCalls.at(-1).q,'Firma');
 await app.nodes().find(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel==='Filtreli Excel indir').props.onPress();await app.settle();
 const exported=new URL(exports[0],'https://crm.example');
 assert.equal(exported.searchParams.get('q'),'Firma');assert.equal(exported.searchParams.get('fairName'),'Fuar A');assert.equal(exported.searchParams.get('province'),'Ankara');assert.equal(exported.searchParams.get('metByUserId'),employee);assert.ok(!exported.searchParams.has('page'),'Excel includes all matches');
 app.nodes().find(n=>n.type==='TouchableOpacity'&&app.text(n).startsWith('Daha Fazla')).props.onPress();await app.settle();assert.equal(listCalls.at(-1).page,2);
 app.nodes().find(n=>n.type==='TouchableOpacity'&&app.text(n).startsWith('Ankara Firma')).props.onPress();await app.settle();assert.ok(app.text().includes('Fuar Kaydı')&&app.text().includes('Gerçek Yetkili'),'actual record detail');
 console.log('PASS: trade-fair endpoints, 81 cities match web, staff/city/fair/search server filters, matching Excel filters, pagination, actual record detail');
})().catch(error=>{console.error(error);process.exitCode=1;});
