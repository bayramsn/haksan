import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(draft) {
  const state = { refs: [], effects: [], query: { data: undefined, isError: false, isFetching: false, isPending: true }, commits: [], applied: [], invalidations: 0, account: 'api|tenant|user||' };
  let cursor = 0;
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('./useAssistantFormDraft.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const mocks = {
    react: { useRef: value => state.refs[cursor++] ?? (state.refs[cursor - 1] = { current: value }), useEffect: effect => state.effects.push(effect) },
    '@tanstack/react-query': {
      useQuery: options => { state.queryOptions = options; return { ...state.query, refetch: async () => { state.query.data = await options.queryFn(); } }; },
      useQueryClient: () => ({ invalidateQueries: async () => { state.invalidations++; } }),
      useMutation: options => ({ isPending: false, mutateAsync: async payload => { const result = await options.mutationFn(payload); await options.onSuccess?.(result); return result; } }),
    },
    '@/src/auth/AuthProvider': { useAuth: () => ({ user: { tenantId: 'tenant', id: state.account === 'api|tenant|user||' ? 'user' : 'other' }, scope: {} }) },
    '@/src/api/config': { apiOrigin: () => 'api' },
    './storage': { assistantSession: () => ({ scope: state.account, enabled: true }) },
    './api': { readDraft: async () => draft, commitDraft: async (id, input) => { state.commits.push({ id, input }); return { resourceId: 'saved-resource' }; } },
  };
  vm.runInNewContext(source, { exports, require: name => { assert(name in mocks, name); return mocks[name]; }, Date, Error });
  state.render = (id = 'draft-id', kind = 'task') => { cursor = 0; state.effects = []; return exports.useAssistantFormDraft(id, kind, value => state.applied.push(value)); };
  state.flush = () => { for (const effect of state.effects) effect(); };
  return state;
}
const draft = { id: 'draft-id', kind: 'task', company: { id: 'company-id', name: 'Firma' }, title: 'İlk başlık', expiresAt: '2099-01-01T00:00:00Z' };

test('assistant form blocks saves until protected draft fetch and prefill complete', async () => {
  const state = harness(draft); const form = state.render();
  assert.equal(form.blocked, true);
  await assert.rejects(form.save({ title: 'Unsafe early save' }), /hazır değil/);
  assert.equal(state.commits.length, 0);
});

test('prefill happens once; retries use the same server operation id and never a normal CRM request', async () => {
  const state = harness(draft); state.render(); state.query.data = await state.queryOptions.queryFn(); state.query.isPending = false;
  state.render(); state.flush();
  let form = state.render(); assert.equal(form.blocked, false); assert.equal(state.applied.length, 1);
  state.query.data = { ...draft, title: 'Refetch should not overwrite edits' }; state.render(); state.flush(); assert.equal(state.applied.length, 1);
  form = state.render(); await form.save({ title: 'User reviewed title' }); await form.save({ title: 'User reviewed title' });
  assert.equal(state.commits.length, 2);
  assert.equal(state.commits[0].input.operationId, draft.id); assert.equal(state.commits[1].input.operationId, draft.id);
  assert.equal(state.commits[0].input.payload.title, 'User reviewed title'); assert.equal(state.invalidations, 2);
});

test('wrong action kind, missing company and expired drafts fail closed', async () => {
  for (const unsafe of [{ ...draft, kind: 'note' }, { ...draft, company: null }, { ...draft, expiresAt: '2000-01-01T00:00:00Z' }]) {
    const state = harness(unsafe); state.render(); await assert.rejects(state.queryOptions.queryFn()); assert.equal(state.commits.length, 0);
  }
});

test('fetch error with stale data never permits a commit', async () => {
  const state = harness(draft); state.query.data = draft; state.query.isPending = false; state.render(); state.flush(); state.query.isError = true;
  const form = state.render(); assert.equal(form.blocked, true); await assert.rejects(form.save({ title: 'Save after failure' })); assert.equal(state.commits.length, 0);
});

 test('account changes block both old save closures and the mounted form', async () => {
  const state = harness(draft); state.query.data = draft; state.query.isPending = false;
  state.render(); state.flush(); const oldForm = state.render();
  assert.equal(oldForm.blocked, false);
  state.account = 'api|tenant|other||';
  await assert.rejects(oldForm.save({ title: 'Old customer' }));
  const switchedForm = state.render(); state.flush();
  assert.equal(switchedForm.blocked, true);
  assert.equal(state.queryOptions.enabled, false);
  await assert.rejects(switchedForm.save({ title: 'Old customer' }));
  assert.equal(state.commits.length, 0);
});
