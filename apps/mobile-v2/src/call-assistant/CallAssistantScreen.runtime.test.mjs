import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id = 'd17a1ab7-72cc-4fb0-b1fe-00aaaabbccdd';
const policy = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./policy.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, { exports: policy, Date });
function harness(input = {}) {
  const slots = [], queued = []; let cursor = 0, offline = true, consumed = 0;
  const pending = { id, action: 'after_call', phoneNumber: '+905321234567', scope: 'api|tenant|user||', createdAt: Date.now(), ...input };
  const element = (type, props) => ({ type, props });
  const mocks = {
    react: { useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => slots[i].value = typeof value === 'function' ? value(slots[i].value) : value]; },
      useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
      useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, j) => v !== slots[i].deps[j])) { const previous = slots[i]; slots[i] = { deps }; queued.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } } },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { Platform: { OS: 'ios' }, ScrollView: 'ScrollView', Switch: 'Switch', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { router: {}, useLocalSearchParams: () => ({ id }) },
    'expo-crypto': {}, 'expo-notifications': {},
    '@tanstack/react-query': { useQuery: () => ({ data: { items: [] }, refetch: async () => {} }) },
    '@/src/ui': { Button: 'Button', Card: 'Card', Field: 'Field', DetailHeader: 'DetailHeader' },
    '@/src/ui/select/fields': { CompanySelect: 'CompanySelect', ContactSelect: 'ContactSelect' },
    '@/src/ui/LiquidGlassTabBarBackground': { useNavigationBottomInset: () => 0 },
    '@/src/api/config': { apiOrigin: () => 'api' },
    '@/src/auth/AuthProvider': { useAuth: () => ({ user: { id: 'user', tenantId: 'tenant' }, scope: {} }), useCan: () => true },
    './Provider': { useCallAssistant: () => ({ enabled: true, available: true, ready: true, handoffReady: true }) },
    './native': { assistantNative: null, nativeAvailability: async () => ({ speech: false }) },
    './storage': { assistantSession: () => ({ enabled: true, scope: pending.scope }), peekAction: () => consumed ? null : pending, consumeAction: async () => { consumed++; return pending; } },
    './policy': policy,
    './api': { matchCall: async () => { if (offline) throw Error('offline'); return { matches: [{ companyId: 'company', companyName: 'ABC Makina' }] }; } },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./CallAssistantScreen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 } }).outputText, { exports, require: name => { assert(name in mocks, name); return mocks[name]; } });
  const Component = exports.default().type;
  return { render() { cursor = 0; const result = Component({ account: pending.scope }); while (queued.length) queued.shift()(); return result; }, online: () => offline = false, consumed: () => consumed };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) { const result = find(child, predicate); if (result) return result; }
  return null;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('offline customer matching preserves the handoff and explicit retry consumes it after success', async () => {
  const h = harness(); h.render(); await flush(); const failed = h.render();
  assert.equal(h.consumed(), 0);
  const retry = find(failed, node => node.props?.label === 'Bekleyen işlemi tekrar yükle'); assert.ok(retry);
  h.online(); retry.props.onPress(); h.render(); await flush(); const recovered = h.render();
  assert.equal(h.consumed(), 1);
  assert.equal(find(recovered, node => node.props?.label === 'Bekleyen işlemi tekrar yükle'), null);
  assert.ok(find(recovered, node => node.type === 'CompanySelect' && node.props.selectedId === 'company'));
  h.render(); await flush(); assert.equal(h.consumed(), 1);
});

test('Siri command reaches review as a customer hint without selecting or creating a CRM record', async () => {
  const command = 'ABC Makina için yeni fırsat hazırla';
  const h = harness({ phoneNumber: undefined, command }); h.render(); await flush(); const screen = h.render();
  assert.equal(h.consumed(), 1);
  assert.ok(find(screen, node => node.type === 'Field' && node.props.value === command));
  assert.ok(find(screen, node => node.type === 'Text' && Array.isArray(node.props.children) && node.props.children.includes('ABC Makina')));
  assert.ok(find(screen, node => node.type === 'CompanySelect' && node.props.selectedId === undefined));
});

test('typed Siri task date is shown on the review screen', async () => {
  const h = harness({ action: 'create_task', phoneNumber: undefined, query: 'Ahmet Bey', dueAt: '2099-10-28T10:00:00Z' });
  h.render(); await flush(); const screen = h.render(); assert.equal(h.consumed(), 1);
  assert.ok(find(screen, node => node.type === 'Text' && Array.isArray(node.props.children) && node.props.children.includes('Ahmet Bey')));
  assert.ok(find(screen, node => node.type === 'Text' && Array.isArray(node.props.children) && node.props.children[0] === 'Takip zamanı: '));
});
