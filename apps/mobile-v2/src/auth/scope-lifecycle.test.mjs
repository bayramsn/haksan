import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

function providerHarness() {
  const exports = {}, renderState = { user: { id: 'alice', tenantId: 'tenant', canViewAllDivisions: false, divisions: [{ id: 'cnc' }], departments: [], accessScopes: [{ divisionId: null }] }, scope: { divisionId: 'cnc', departmentId: null }, callbacks: [], changes: [] };
  let cursor = 0;
  const jsx = (type, props, key) => ({ type, props, key });
  const mocks = {
    react: { Fragment: 'Fragment', createContext: () => ({ Provider: 'Provider' }), useState: () => [[renderState.user, null, renderState.scope, false][cursor++], () => {}], useCallback: fn => { renderState.callbacks.push(fn); return fn; }, useEffect: () => {}, useRef: value => ({ current: value }), useMemo: fn => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/src/security/startup': {}, '@/src/security/secure-store': {}, '@/src/api/endpoints': {}, '@/src/api/client': {},
    '@/src/modules/navigationContext': { bindNavigationContext: () => {} },
    'expo-crypto': { getRandomValues: bytes => bytes },
    '@/src/offline/queue': { setQueueScope: () => {} }, '@/src/api/config': { apiOrigin: () => 'https://test.invalid' },
    '@/src/query/client': { queryClient: { clear: () => {} } }, '@/src/push/usePush': {},
    './scope': { activeScope: () => renderState.scope, setActiveScope: scope => renderState.changes.push(scope) },
  };
  const source = ts.transpileModule(readFileSync(new URL('./AuthProvider.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require: name => mocks[name], Date, Error, Set, JSON });
  return { state: renderState, render: () => { cursor = 0; renderState.callbacks = []; return exports.AuthProvider({ children: 'screens' }).props.children; } };
}

test('provider remount boundary changes for user, tenant, division and department', () => {
  const h = providerHarness(); let previous = h.render().key;
  for (const mutate of [() => { h.state.scope.divisionId = 'sac'; }, () => { h.state.scope.departmentId = 'service'; }, () => { h.state.user.id = 'bob'; }, () => { h.state.user.tenantId = 'other'; }, () => { h.state.user.roles = ['admin']; }, () => { h.state.user.canViewAllDivisions = true; }, () => { h.state.user.departmentId = 'legacy-department'; }]) {
    mutate(); const boundary = h.render(); assert.equal(boundary.type, 'Fragment'); assert.notEqual(boundary.key, previous); previous = boundary.key;
  }
});

test('resource-specific all-division grant permits selecting all like the web', () => {
  const h = providerHarness(); h.render(); h.state.callbacks[1]({ divisionId: null, departmentId: null });
  assert.equal(h.state.changes[0].divisionId, null);
});

test('recreating observer after scope clear fetches new scope even with identical query key', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  let division = 'cnc'; const requests = [];
  const options = { queryKey: ['products', 'list', 'all'], queryFn: async () => { requests.push(division); return [division]; } };
  const first = new QueryObserver(client, options); const unsubscribe = first.subscribe(() => {});
  await new Promise(setImmediate); assert.equal(first.getCurrentResult().data[0], 'cnc');
  division = 'sac'; client.clear(); unsubscribe(); first.destroy();
  const replacement = new QueryObserver(client, options); const stop = replacement.subscribe(() => {});
  await new Promise(setImmediate);
  assert.deepEqual(requests, ['cnc', 'sac']); assert.equal(replacement.getCurrentResult().data[0], 'sac');
  stop(); replacement.destroy(); client.clear();
});
