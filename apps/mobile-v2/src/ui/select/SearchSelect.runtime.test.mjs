import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as logic from './select-logic.ts';

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function render({ search = 'Lazer', debounced = search, remote, optionsError } = {}) {
  let state = [true];
  const mocks = {
    react: { createContext: () => ({ Provider: 'Provider' }), useContext: () => null, useState: initial => [state.length ? state.shift() : initial, () => {}], useMemo: fn => fn() },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { FlatList: 'FlatList', Pressable: 'Pressable', Text: 'Text', View: 'View' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, '@/src/theme/theme': { useTheme: () => ({ colors: {} }) },
    '@/src/ui': { EmptyState: 'EmptyState', ErrorState: 'ErrorState', Loading: 'Loading', SearchBar: 'SearchBar' },
    '@/src/ui/pickers/HostedSheet': { HostedSheet: 'HostedSheet' }, '@/src/ui/pickers/PickerField': { PickerField: 'PickerField' },
    '@/src/ui/pickers/SelectionRow': { SelectionRow: 'SelectionRow' }, '@/src/ui/pickers/SelectionStatus': { SelectionStatus: 'SelectionStatus' },
    '@/src/ui/pickers/SelectionListFooter': { SelectionListFooter: 'SelectionListFooter' },
    '@/src/lib/useDebouncedValue': { useDebouncedValue: () => debounced }, './select-logic': logic,
  };
  const context = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name]; } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./SearchSelect.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const picked = [];
  const outer = context.exports.SearchSelect({ label: 'Ürün', placeholder: 'Seçin', value: '', icon: 'cube-outline', allowCustom: true, onSelect: item => picked.push(item), options: [], optionsError, useRemote: remote ? () => remote : undefined });
  const body = nodes(outer).find(node => typeof node.type === 'function' && node.type.name === 'SheetBody');
  state = [search];
  return { tree: body.type(body.props), picked };
}
const remote = { items: [{ id: 'old', label: 'Önceki arama sonucu' }], isPending: false, error: null, refetch() {} };
test('debounce sırasında önceki sonuç seçilemez ve serbest kayıt önerilmez', () => {
  const { tree } = render({ remote, debounced: '' });
  assert.equal(nodes(tree).find(node => node.type === 'FlatList').props.data.length, 0);
  assert.equal(nodes(tree).filter(node => node.type === 'Pressable').length, 0);
  assert.equal(nodes(tree).find(node => node.type === 'SelectionStatus').props.loading, true);
});
test('önbellekte seçenek varken sorgu hatası yeniden deneme ile görünür kalır', () => {
  const error = new Error('offline'); const source = { ...remote, error };
  const { tree } = render({ remote: source });
  const status = nodes(tree).find(node => node.type === 'SelectionStatus');
  assert.equal(status.props.error, error); assert.equal(status.props.onRetry, source.refetch);
  assert.equal(nodes(tree).filter(node => node.type === 'Pressable').length, 0);
});
test('başarılı ve tamamlanmış aramada kullanıcı kendi metnini seçebilir', () => {
  const { tree, picked } = render({ remote: { ...remote, items: [] } });
  nodes(tree).find(node => node.type === 'Pressable').props.onPress();
  assert.equal(picked[0].label, 'Lazer'); assert.equal(picked[0].id, '');
});
test('yerel seçenek hatası boş listeye veya serbest kayıt teklifine dönüşmez', () => {
  const error = new Error('lookup offline'); const { tree } = render({ optionsError: error });
  assert.equal(nodes(tree).find(node => node.type === 'SelectionStatus').props.error, error);
  assert.equal(nodes(tree).filter(node => node.type === 'Pressable').length, 0);
});
