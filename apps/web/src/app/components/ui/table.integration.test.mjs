import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Run against the installed React 18 implementation without package entry shims.
// This also works when macOS has left those tiny shims as dataless placeholders.
const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const require = createRequire(import.meta.url);
const ts = require(path.join(root, 'node_modules/typescript/lib/typescript.js'));
const evaluate = (source, customRequire, filename) => {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', 'process', '__filename', '__dirname', source)(module, module.exports, customRequire, process, filename, path.dirname(filename));
  return module.exports;
};
const loadCjs = (relative, customRequire = require) => {
  const filename = path.join(root, relative);
  return evaluate(fs.readFileSync(filename, 'utf8'), customRequire, filename);
};
const React = loadCjs('apps/web/node_modules/react/cjs/react.development.js');
const server = loadCjs('apps/web/node_modules/react-dom/cjs/react-dom-server-legacy.node.development.js', (id) => id === 'react' ? React : require(id));
let buttons = [];
const instrumentedReact = { ...React, createElement: (type, props, ...children) => {
  if (type === 'button') buttons.push(props);
  return React.createElement(type, props, ...children);
} };
const loadTs = (relative, dependencies = {}) => {
  const filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  return evaluate(output, (id) => dependencies[id] ?? require(id), filename);
};
const comparison = loadTs('apps/web/src/app/components/ui/tableSorting.ts');
const { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } = loadTs('apps/web/src/app/components/ui/table.tsx', {
  react: instrumentedReact, './utils': { cn: (...parts) => parts.filter(Boolean).join(' ') }, './tableSorting': comparison,
});
const h = React.createElement;
const row = (key, label, amount, props = {}) => h(TableRow, { key, 'data-record': key, ...props }, h(TableCell, null, label), h(TableCell, null, amount));
function render(rows, tableProps = {}, heads = [h(TableHead, { key: 'name', sortKey: 'name' }, 'Ad'), h(TableHead, { key: 'amount', sortKey: 'amount' }, 'Tutar')]) {
  buttons = [];
  return server.renderToStaticMarkup(h(Table, tableProps, h(TableHeader, null, h(TableRow, null, heads)), h(TableBody, null, rows)));
}
const recordOrder = (html) => [...html.matchAll(/data-record="([^"]+)"/g)].map((match) => match[1]);

test('shared React table sorts formatted amounts and exposes accessible toggle', () => {
  const changes = [];
  const html = render([row('a', 'A', '2.000,00 EUR'), row('b', 'B', '150,00 EUR')], { sort: { key: 'amount', direction: 'asc' }, onSortChange: (next) => changes.push(next) });
  assert.deepEqual(recordOrder(html), ['b', 'a']);
  assert.match(html, /aria-sort="ascending"/);
  buttons.find((button) => button['aria-label'] === 'Tutar: azalan sırala').onClick({ stopPropagation() {} });
  assert.deepEqual(changes, [{ key: 'amount', direction: 'desc' }]);
});
test('manual sorting keeps server row order and emits the requested sort', () => {
  const changes = [];
  const html = render([row('z', 'Z', 10), row('a', 'A', 1)], { manualSorting: true, sort: { key: 'name', direction: 'asc' }, onSortChange: (next) => changes.push(next) });
  assert.deepEqual(recordOrder(html), ['z', 'a']);
  buttons[0].onClick({ stopPropagation() {} });
  assert.deepEqual(changes, [{ key: 'name', direction: 'desc' }]);
});
test('master/detail fragments remain together and section rows stay anchored', () => {
  const group = (key, label) => h(React.Fragment, { key }, row(key, label, 0), h(TableRow, { 'data-record': `${key}-detail` }, h(TableCell, { colSpan: 2 }, `Detay ${label}`)));
  const section = h(TableRow, { key: 'section', 'data-record': 'section' }, h(TableCell, { colSpan: 2 }, 'İkinci grup'));
  const html = render([group('z', 'Z'), group('a', 'A'), section, row('y', 'Y', 0), row('b', 'B', 0)], { defaultSort: { key: 'name', direction: 'asc' } });
  assert.deepEqual(recordOrder(html), ['a', 'a-detail', 'z', 'z-detail', 'section', 'b', 'y']);
});
test('raw row metadata sorts opaque custom components', () => {
  const Money = ({ amount }) => h('b', null, `${amount} EUR`);
  const html = render([row('a', 'A', h(Money, { amount: 100 }), { sortValues: ['A', 100] }), row('b', 'B', h(Money, { amount: 20 }), { sortValues: ['B', 20] })], { defaultSort: { key: 'amount', direction: 'asc' } });
  assert.deepEqual(recordOrder(html), ['b', 'a']);
  assert.doesNotMatch(html, /sortValues/);
});
test('empty/action and externally managed headers do not acquire duplicate sort controls', () => {
  render([row('a', 'A', 1)], {}, [h(TableHead, { key: 'empty' }), h(TableHead, { key: 'actions' }, 'İşlemler'), h(TableHead, { key: 'manual', 'aria-sort': 'ascending' }, h('button', { type: 'button' }, 'Mevcut sıralama'))]);
  assert.equal(buttons.length, 0);
});

test('transparent wrapper fragments do not prevent list sorting', () => {
  const html = render(h(React.Fragment, null, row('z', 'Z', 10), row('a', 'A', 1)), { defaultSort: { key: 'name', direction: 'asc' } });
  assert.deepEqual(recordOrder(html), ['a', 'z']);
});

test('pure component sort resolvers support localized labels and raw decimals', () => {
  const State = ({ code }) => h('span', null, code === 'active' ? 'Aktif' : 'Pasif');
  State.getSortValue = ({ code }) => code === 'active' ? 'Aktif' : 'Pasif';
  const labels = render([row('p', h(State, { code: 'inactive' }), 0), row('a', h(State, { code: 'active' }), 0)], { defaultSort: { key: 'name', direction: 'asc' } });
  assert.deepEqual(recordOrder(labels), ['a', 'p']);
  const Money = ({ amount }) => h('span', null, `${amount} EUR`);
  Money.getSortValue = ({ amount }) => amount;
  const values = render([row('a', 'A', h(Money, { amount: 1.234 })), row('b', 'B', h(Money, { amount: 20 }))], { defaultSort: { key: 'amount', direction: 'asc' } });
  assert.deepEqual(recordOrder(values), ['a', 'b']);
});

test('opaque components without a resolver remain stable rather than being executed', () => {
  const Opaque = ({ record }) => h('span', null, record.name);
  const html = render([row('a', h(Opaque, { record: { name: 'Z' } }), 1), row('b', h(Opaque, { record: { name: 'A' } }), 2)], { defaultSort: { key: 'name', direction: 'asc' } });
  assert.deepEqual(recordOrder(html), ['a', 'b']);
});
