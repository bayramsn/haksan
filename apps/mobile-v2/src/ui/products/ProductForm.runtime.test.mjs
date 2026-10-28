import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as formLogic from './product-form.ts';
import * as saveLogic from './product-save.ts';

function harness({ failedPart, manualSpecs = false, templateError = false, initialForm, network } = {}) {
  const effects = [], writes = [], alerts = []; let cursor = 0;
  const ready = data => ({ data, isPending: false, isError: false, error: null, refetch: async () => {} });
  const specs = ready([]), equipment = ready([]);
  if (failedPart) Object.assign(failedPart === 'specs' ? specs : equipment, { isError: true, error: new Error('parts unavailable') });
  const jsx = (type, props, key) => ({ type, props, key });
  const mocks = {
    react: { useRef: value => ({ current: value }), useEffect: fn => effects.push(fn), useMemo: fn => fn(), useState: initial => { const index = cursor++; const value = index === 0 && initialForm ? initialForm : index === 9 ? true : manualSpecs && index === 2 ? [{ key: 'A', value: '12', unit: '', groupCode: null }] : manualSpecs && index === 6 ? true : typeof initial === 'function' ? initial() : initial; return [value, next => writes.push({ index, value: typeof next === 'function' ? next(value) : next })]; } },
    'expo-crypto': { randomUUID: () => 'uuid' }, '@/src/api/config': { apiOrigin: () => 'https://test.invalid' }, '@/src/api/client': { ApiError: class extends Error { constructor(status) { super('API'); this.status = status; } } }, './product-create-draft': { readPendingProductCreate: async () => null, writePendingProductCreate: async value => network?.write?.(value), clearPendingProductCreate: async () => network?.clear?.() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
    'expo-router': { useRouter: () => ({ back: () => network?.back?.() }), Redirect: 'Redirect' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/src/auth/AuthProvider': { useAuth: () => ({ user: { roles: ['admin'], permissions: [] } }) }, '@/src/auth/scope': { activeScope: () => ({ divisionId: 'cnc' }) },
    '@/src/api/crm.hooks': { useLookup: () => ready([]) },
    '@/src/api/inventory.hooks': { useProduct: () => ready({ id: 'p', fullName: 'Product' }), useUpdateProduct: () => ({}) },
    '@/src/api/products.hooks': { useAllProducts: () => ready([]), useBrands: () => ready([]), useCreateProduct: () => ({ mutateAsync: body => network.create(body) }), useProductEquipment: () => equipment, useProductSpecs: () => specs, useProductTaxonomy: () => ready({ groups: [], categories: [], subcategories: [], types: [] }), useReplaceProductDetails: () => ({}), useSpecTemplates: () => templateError ? { ...ready(undefined), error: new Error('template offline'), isError: true } : ready([]) },
    '@/src/api/endpoints': { productsApi: {} }, '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    './product-save': saveLogic, '@/src/api/products.api': { productsExtraApi: { recoverCreate: async key => { if (network?.receipt) return { id: network.receipt }; throw new mocks['@/src/api/client'].ApiError(404); }, replaceDetails: async () => {} } }, '@/src/theme/theme': { useTheme: () => ({ colors: {} }) },
    '@/src/ui': { Card: 'Card', ErrorState: 'ErrorState', Eyebrow: 'Eyebrow', Field: 'Field', Loading: 'Loading' },
    '@/src/ui/pickers/CompanyPicker': { CompanyPicker: 'CompanyPicker' }, '@/src/ui/pickers/OptionPicker': { OptionPicker: 'OptionPicker', MultiOptionPicker: 'MultiOptionPicker' },
    '@/src/ui/select/fields': { CountrySelect: 'CountrySelect' }, '@/src/ui/toast': { toast: { error: () => {}, success: () => {} } }, '@/src/ui/finance/kit': { FormScreen: 'FormScreen', Segmented: 'Segmented', SmallButton: 'SmallButton' },
    '@/src/ui/products/product-form': formLogic,
  };
  const exports = {}, source = ts.transpileModule(readFileSync(new URL('./ProductForm.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Error, Boolean, JSON });
  return { render: id => exports.ProductForm({ id }), effects, writes, alerts };
}
function nodes(value) { if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(nodes); return [value, ...nodes(value.props?.children)]; }

test('failed partial edit load shows retry screen and never hydrates an empty snapshot', () => {
  for (const failedPart of ['specs', 'equipment']) {
    const h = harness({ failedPart }); const tree = h.render('p'); h.effects.forEach(fn => fn());
    assert.equal(nodes(tree).find(node => node.type === 'ErrorState').props.message, 'parts unavailable');
    assert.equal(h.writes.length, 0); assert.equal(tree.props.onSubmit, undefined);
  }
});

test('changing product taxonomy asks confirmation and preserves manually edited specs', () => {
  const h = harness({ manualSpecs: true }); const tree = h.render();
  nodes(tree).find(node => node.type === 'OptionPicker' && node.props.label === '1. Ürün Grubu').props.onChange('SAC');
  assert.equal(h.writes.length, 0); assert.equal(h.alerts.length, 1);
  h.alerts[0][2][1].onPress();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].index, 0); assert.equal(h.writes[0].value.productGroupCode, 'SAC');
});

test('template load error stays distinguishable from no template with a retry action', () => {
  const h = harness({ templateError: true }); const errors = nodes(h.render()).filter(node => node.type === 'ErrorState');
  assert.ok(errors.some(node => node.props.message.includes('template offline') && typeof node.props.onRetry === 'function'));
});


test('a server-committed POST with lost response recovers before retry instead of creating twice', async () => {
  const writes = [], calls = [];
  const network = {
    receipt: null,
    write: draft => { writes.push(draft); calls.push('persist'); },
    create: async body => { calls.push('create'); network.receipt = 'committed-product'; throw new Error('response lost after commit'); },
    clear: () => calls.push('clear'), back: () => calls.push('back'),
  };
  const initialForm = { ...formLogic.EMPTY_PRODUCT_FORM, productGroupCode: 'CNC', categoryCode: 'TEZGAH', productTypeCode: 'MACHINE', brandId: 'brand', fullName: 'Product', modelCode: 'MODEL' };
  const h = harness({ initialForm, network }); const tree = h.render();
  tree.props.onSubmit(); await new Promise(setImmediate);
  assert.equal(calls.filter(item => item === 'create').length, 1); assert.equal(calls[0], 'persist');
  tree.props.onSubmit(); await new Promise(setImmediate);
  assert.equal(calls.filter(item => item === 'create').length, 1); assert.ok(calls.includes('back'));
  assert.equal(writes.length, 2); assert.equal(writes[0].operationId, writes[1].operationId);
});
