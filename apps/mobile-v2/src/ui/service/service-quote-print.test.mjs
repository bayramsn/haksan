import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { serviceQuotePrintHtml, safeServiceSignatureImage } from './service-quote-print.ts';
import { defaultServiceQuote, normalizeServiceQuote, serviceQuoteMissingFields, quoteTotals } from './serviceForms.ts';
const now = new Date('2026-11-04T10:00:00Z');
const quote = () => ({ ...defaultServiceQuote({ ticketNo: 'CNC-SRV-2026/0010', company: { name: 'ABC Makina' }, writer: { name: 'Ayşe' } }, now, 1), subject: 'Periyodik bakım', items: [{ id: 'part', description: 'Rulman', quantity: 2, unit: 'Ad.', unitPrice: 125.5 }], notes: ['Yerinde servis'], vatRate: 20, vatAmount: 0 });
test('service PDF contains customer, machine, date, saved line items and web-equivalent totals', () => {
  const form = quote();
  const html = serviceQuotePrintHtml(form, { brand: 'Haas', model: 'VF2', serialNumber: 'SERİ-25' });
  for (const value of ['ABC Makina', '04.11.2026', 'Haas · VF2', 'SERİ-25', 'Rulman', '251,00 USD', '50,20 USD', '301,20 USD', 'Yerinde servis']) assert.ok(html.includes(value), value);
  const manualVat = { ...form, vatAmount: 15 };
  assert.equal(quoteTotals(manualVat).total, 266);
  assert.ok(serviceQuotePrintHtml(manualVat).includes('266,00 USD'));
});
test('all free text is escaped and remote image/script URLs never become active PDF markup', () => {
  const payload = '\"><img src=https://example.test onerror=alert(1)><script>bad()</script>&';
  const form = quote();
  for (const key of ['company', 'contact', 'mobile', 'phone', 'address', 'email', 'quoteNo', 'date', 'validity', 'writerName', 'writerTitle', 'writerEmail', 'subject', 'currency']) form[key] = payload;
  form.items = [{ ...form.items[0], description: payload, unit: payload }]; form.notes = [payload];
  form.signature = { id: 'sig', name: payload, title: payload, imageUrl: 'https://example.test/signature.png' };
  const html = serviceQuotePrintHtml(form, { brand: payload, serialNumber: payload });
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.equal(/<script|<img\b|<[^>]+\s(?:src|href)=/i.test(html), false);
  assert.ok(html.includes("default-src 'none'"));
});
test('signature images permit bounded PNG/JPEG/WebP data with matching magic, reject URL, SVG and MIME spoofing', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=';
  assert.equal(safeServiceSignatureImage(png), png);
  assert.ok(serviceQuotePrintHtml({ ...quote(), signature: { id: 'sig', name: 'Ayşe', title: 'Müdür', imageUrl: png } }).includes(`<img src="${png}"`));
  for (const value of ['javascript:alert(1)', 'https://example.test/a.png', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', png.replace('image/png', 'image/jpeg'), 'data:image/png;base64,' + 'A'.repeat(2_800_000), 'data:image/png;base64,broken']) assert.equal(safeServiceSignatureImage(value), null);
});
function action(name, bindings) {
  const file = new URL('./ServiceQuoteEditor.tsx', import.meta.url);
  const source = readFileSync(file, 'utf8'), ast = ts.createSourceFile('ServiceQuoteEditor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer.getText(ast);
    if (ts.isFunctionDeclaration(node) && node.name?.getText(ast) === name) expression = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(expression);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`exports.value = ${expression}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, { exports, Date, ...bindings });
  return exports.value;
}
function bindings(overrides = {}) {
  const calls = [];
  return { calls, canUpdate: true, canReadTicket: true, busy: false, operationInFlight: { current: false }, draft: quote(), preview: quote(), ticket: { ticketNo: 'CNC-SRV-2026/0010' }, context: {}, normalizeServiceQuote, serviceQuoteMissingFields, serviceQuotePrintHtml,
    write: async () => calls.push('save'), shareServerPdf: async () => calls.push('pdf'), setDraft: () => {}, setPreview: () => {}, setPrinting: () => {}, toast: { success: () => {}, error: () => calls.push('error') }, ...overrides };
}
test('save-and-PDF shares only after successful persistence and never after save rejection', async () => {
  const good = bindings(); await action('save', good)(true); assert.deepEqual(good.calls, ['save', 'pdf']);
  const rejected = bindings({ write: async () => { throw Error('offline'); } }); await action('save', rejected)(true); assert.deepEqual(rejected.calls, ['error']);
  const denied = bindings({ canUpdate: false }); await action('save', denied)(true); assert.deepEqual(denied.calls, []);
});
test('saved PDF uses persisted preview, prevents duplicate action and respects read access', async () => {
  const recorded = [];
  const current = bindings({ draft: { ...quote(), company: 'UNSAVED' }, shareServerPdf: async (kind, html) => { assert.equal(kind, 'service-quote'); recorded.push(html); } });
  await action('shareSaved', current)(); assert.ok(recorded[0].includes('ABC Makina')); assert.equal(recorded[0].includes('UNSAVED'), false);
  for (const denied of [{ canReadTicket: false }, { busy: true }, { operationInFlight: { current: true } }]) {
    const blocked = bindings(denied); await action('shareSaved', blocked)(); assert.deepEqual(blocked.calls, []);
  }
});
