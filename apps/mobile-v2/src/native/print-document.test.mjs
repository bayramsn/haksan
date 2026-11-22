import test from 'node:test';
import assert from 'node:assert/strict';
import { printDocument, safePrintImage } from './print-document.ts';
test('print fields cannot inject markup or network resources',()=>{
 const html=printDocument({title:'<script>alert(1)</script>',subtitle:'<img src="https://x">',sections:[{title:'Başlık',rows:[{label:'<b>Firma</b>',value:'& Alıcı'}],lines:['<iframe src="https://x">']}]});
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<iframe'));
 assert.ok(html.includes('default-src'));assert.ok(html.includes('&amp; Alıcı'));
});
test('only bounded raster data images enter print documents',()=>{
 for(const url of ['https://example.org/a.png','file:///secret','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,!'])assert.equal(safePrintImage(url),'');
 assert.equal(safePrintImage('data:image/png;base64,YQ=='),'data:image/png;base64,YQ==');
});
test('report tables preserve every row and escape headers, cells and empty messages',()=>{
 const html=printDocument({title:'Rapor',sections:[{title:'Detay',table:{headers:['Kişi','<script>'],rows:[['<img src="https://x">','&'],['Son kayıt',0]]}},{title:'Boş',table:{headers:['Ad','Adet'],rows:[],empty:'<iframe>'}}]});
 assert.ok(html.includes('Son kayıt'));assert.ok(html.includes('<td>0</td>'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('colspan="2"'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<iframe>'));
});
