import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { productTechnicalPrintInput } from './product-technical-print.ts';
import { printDocument } from '../../native/print-document.ts';
import { HEX2026_REVISION } from '@haksan/shared';
const product = () => ({ id: 'p1', fullName: 'Tezgah', modelCode: 'VF2', modelName: 'VF-2', brand: { name: 'HAAS' }, series: 'VF', stockCode: 'STK-1', vatRate: '20', originCountry: 'ABD', hsCode: '8457', listPrice: '12345.67', cashPrice: '11111.11', currency: { code: 'USD' }, specs: [{ key: 'X Ekseni', value: '800', unit: 'mm' }, { key: 'Boş Alan', value: '-' }], standardEquipment: ['Fanuc kontrol'], optionalEquipment: ['Konveyör'] });
test('technical sheet includes identity, real specs and equipment but never commercial prices', () => {
  const input = productTechnicalPrintInput(product(), { optionSets: [{ name: 'Güç', values: [{ value: '3 kW', priceDelta: '99999' }] }], compatibleOptional: [{ product: { fullName: 'Robot', listPrice: '55555' } }] });
  const html = printDocument(input);
  for (const text of ['HAAS', 'VF-2', 'STK-1', '8457', 'ABD', '%20', '800 mm', 'Fanuc kontrol', 'Konveyör', 'Robot', '3 kW']) assert.ok(html.includes(text), text);
  for (const text of ['12345.67', '11111.11', '99999', '55555', 'Boş Alan']) assert.equal(html.includes(text), false, text);
});
test('saved technical profile overrides live product specs and does not borrow another configuration', () => {
  const input = productTechnicalPrintInput({ ...product(), technicalConfiguration: { selection: { sourceModelCode: 'F3015', series: 'F', powerKw: 6, cabinType: 'closed' }, sizeLabel: '3000 × 1500', specs: [{ key: 'X Ekseni', value: '3000', unit: 'mm', groupName: 'Performans' }] } });
  const html = printDocument(input);
  assert.ok(html.includes('3000 mm')); assert.ok(html.includes('6 kW')); assert.ok(html.includes('Kapalı')); assert.equal(html.includes('800 mm'), false);
});
test('base cards include verified model technical data and option powers without pricing', () => {
  const base = { ...product(), specs: [], laserBaseConfiguration: { sourceRevision: HEX2026_REVISION, series: 'H', sourceModelCodes: ['H-3015'] } };
  const input = productTechnicalPrintInput(base);
  assert.ok(input.sections.some(section => section.title === 'Baz Kart Modelleri' && section.lines.includes('H-3015')));
  assert.ok(input.sections.some(section => section.title === 'H-3015 — Teknik Bilgiler' && section.rows.length > 0));
  const universal = productTechnicalPrintInput({ ...product(), baseModelConfiguration: { configurations: [{ sourceModelCode: 'VMC1000', specs: [{ key: 'Tabla', value: '1000', unit: 'mm' }] }] } });
  assert.ok(printDocument(universal).includes('1000 mm'));
});
test('untrusted product and option text stays escaped; inline image is the only image source', () => {
  const unsafe = '<script>alert(1)</script><img src=https://bad.test>'; const p = product(); p.fullName = unsafe; p.specs[0].value = unsafe;
  const html = printDocument(productTechnicalPrintInput(p, { image: 'https://bad.test/photo', optionSets: [{ name: unsafe, values: [{ name: unsafe }] }] }));
  assert.ok(html.includes('&lt;script&gt;')); assert.equal(/<script|<img\b/i.test(html), false);
});
function shareAction(bindings) {
  const source = readFileSync(new URL('../../../app/(tabs)/(home,companies,opportunities,calendar,modules)/modules/products/[id].tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let expression;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.getText(ast) === 'shareTechnicalPdf') expression = node.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(expression); const exports = {};
  vm.runInNewContext(ts.transpileModule(`exports.value = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS } }).outputText, { exports, productTechnicalPrintInput, printDocument, ...bindings }); return exports.value;
}
function bindings(overrides = {}) {
  const calls = []; return { calls, canRead: true, data: { ...product(), imageUrl: '/products/media/id' }, printInFlight: { current: false }, optionSets: { data: [] }, compatibleOptional: { data: [] }, media: { data: [] }, toast: { error: () => calls.push('error') }, setPrinting: () => {}, productPrintImage: async () => { calls.push('image'); return undefined; }, shareServerPdf: async () => calls.push('pdf'), ...overrides };
}
test('image adapter failure blocks silent photo-less output and permission/busy states block export', async () => {
  const good = bindings(); await shareAction(good)(); assert.deepEqual(good.calls, ['image', 'pdf']);
  const failed = bindings({ productPrintImage: async () => { throw Error('photo failed'); } }); await shareAction(failed)(); assert.deepEqual(failed.calls, ['error']);
  for (const denied of [{ canRead: false }, { printInFlight: { current: true } }]) { const context = bindings(denied); await shareAction(context)(); assert.deepEqual(context.calls, []); }
});
test('technical mail stages only the product PDF and navigates with an opaque draft id without sending', async () => {
  const staged = [], routes = [];
  const context = bindings({ canMail: true, stageMailDocument: draft => { staged.push(draft); return 'opaque-uuid'; }, router: { push: route => routes.push(route) } });
  await shareAction(context)(true);
  assert.equal(staged.length, 1);
  assert.equal(staged[0].payload.productDocument.id, 'p1');
  assert.ok(staged[0].payload.productDocument.pdf.html.includes('X Ekseni'));
  assert.equal(staged[0].payload.productDocument.pdf.filename, 'VF2-teknik-bilgiler.pdf');
  assert.deepEqual(Object.keys(routes[0].params), ['draftId']);
  assert.equal(routes[0].params.draftId, 'opaque-uuid');
  assert.equal(context.calls.includes('pdf'), false);
  const denied = bindings({ canMail: false }); await shareAction(denied)(true); assert.deepEqual(denied.calls, []);
});
