import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ cursor: 0, user: { id: 'alice', tenantId: 'tenant', roles: ['sales'], permissions: ['products.read'], canViewAllDivisions: false, departmentId: 'sales', divisions: [], departments: [], accessScopes: [] } as Record<string, unknown>, division: 'cnc', department: 'sales', callbacks: [] as Array<(...args: any[]) => unknown>, clears: 0 }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useState: () => [[false, state.user, null, state.division, state.department][state.cursor++], () => {}], useRef: (value: unknown) => ({ current: value }), useEffect: () => {}, useMemo: (fn: () => unknown) => fn(), useCallback: (fn: (...args: any[]) => unknown) => { state.callbacks.push(fn); return fn; } }));
vi.mock('./apiClient', () => ({ api: {}, ApiError: class extends Error {}, RequestScopeChangedError: class extends Error {}, getAccessToken: () => 'token', getActiveDivision: () => state.division, getActiveDepartment: () => state.department, setActiveDivision: (value: string) => { state.division = value; }, setActiveDepartment: (value: string) => { state.department = value; }, invalidateRequestContext: () => {}, requestContextKey: () => 'context' }));
vi.mock('./chatRealtime', () => ({ disconnectChatSocket: () => {} }));
vi.mock('./queryClient', () => ({ queryClient: { clear: () => { state.clears++; } } }));
import { AuthProvider } from './auth';
function render() { state.cursor = 0; state.callbacks = []; return AuthProvider({ children: 'screens' }).props.children; }
beforeEach(() => { state.clears = 0; });
it('remounts screen/query owners for identity, scope and authorization changes', () => {
  let key = render().key;
  const changes = [() => { state.division = 'sac'; }, () => { state.department = 'service'; }, () => { state.user.id = 'bob'; }, () => { state.user.roles = ['admin']; }, () => { state.user.canViewAllDivisions = true; }, () => { state.user.departmentId = 'legacy'; }, () => { state.user.permissions = ['products.read', 'products.update']; }];
  for (const change of changes) { change(); const next = render().key; expect(next).not.toBe(key); key = next; }
});
it('clears cached queries when switching either active scope dimension', () => {
  render(); state.callbacks[0]('uni'); state.callbacks[1]('finance'); expect(state.clears).toBe(2);
});
