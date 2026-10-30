import * as Crypto from 'expo-crypto';
import * as SecureStore from '@/src/security/secure-store';
import { CALL_RETURN_TTL, validPending, type PendingAction } from './policy';
const key = 'haksan_call_assistant_v1';
export type CallContext = { id: string; scope: string; startedAt: number; companyId?: string; contactId?: string; phoneNumber: string; leftApp: boolean };
type State = { scope: string; enabled: boolean; deviceId: string; call?: CallContext; pending?: PendingAction; pendingActions?: PendingAction[] };
let state: State | null = null;
let activeScope: string | null = null;
let revision = 0;
let chain: Promise<unknown> = Promise.resolve();
async function persist(next: State | null) {
  const rev = revision;
  chain = chain.catch(() => undefined).then(async () => {
    if (rev !== revision) return;
    if (next) await SecureStore.setItemAsync(key, JSON.stringify(next), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    else await SecureStore.deleteItemAsync(key);
  });
  await chain;
}
export async function activateAssistant(scope: string | null): Promise<void> {
  activeScope = scope; const rev = ++revision;
  state = null;
  if (!scope) { await persist(null); return; }
  await chain.catch(() => undefined);
  const raw = await SecureStore.getItemAsync(key);
  if (rev !== revision) return;
  let saved: State | null = null;
  try { saved = raw ? JSON.parse(raw) : null; } catch { /* fail closed */ }
  state = saved?.scope === scope && typeof saved.enabled === 'boolean' && typeof saved.deviceId === 'string'
    ? saved : { scope, enabled: false, deviceId: Crypto.randomUUID() };
  await persist(state);
}
export const assistantSession = () => state?.scope === activeScope ? state : null;
export async function setAssistantEnabled(enabled: boolean) { if (!state) return; state = { ...state, enabled, ...(enabled ? {} : { call: undefined, pending: undefined, pendingActions: undefined }) }; await persist(state); }
export async function beginCall(phoneNumber: string, context: { companyId?: string; contactId?: string } = {}) {
  if (!state?.enabled) return null;
  const call: CallContext = { id: Crypto.randomUUID(), scope: state.scope, startedAt: Date.now(), phoneNumber, ...context, leftApp: false };
  state = { ...state, call: call }; await persist(state); return call;
}
export async function markCallLeft() { if (state?.call && !state.call.leftApp) { state = { ...state, call: { ...state.call, leftApp: true } }; await persist(state); } }
export async function clearCall(id: string): Promise<void> {
  if (state?.call?.id !== id) return;
  state = { ...state, call: undefined }; await persist(state);
}
/** Keep the context until the API succeeds, so an offline return is retryable. */
export function returnedCall(): CallContext | null {
  if (!state?.enabled || !state.call?.leftApp) return null;
  const call = state.call;
  return call.scope === activeScope && Date.now() - call.startedAt <= CALL_RETURN_TTL && Date.now() >= call.startedAt ? call : null;
}
function pendingActions(current: State): PendingAction[] {
  return [...(current.pendingActions ?? []), ...(current.pending ? [current.pending] : [])]
    .filter((item, index, items) => validPending(item, current.scope) && items.findIndex(other => other.id === item.id) === index);
}
export async function queueAction(action: PendingAction): Promise<boolean> {
  if (!state?.enabled || !validPending(action, state.scope)) return false;
  const rev = revision;
  const items = pendingActions(state);
  // Never replace another unconsumed handoff (including a second SIM's call).
  if (!items.some(item => item.id === action.id)) {
    if (items.length >= 20) return false;
    items.push(action);
  }
  state = { ...state, pending: undefined, pendingActions: items }; await persist(state);
  return rev === revision && state?.enabled === true;
}
export async function consumeAction(id?: string): Promise<PendingAction | null> {
  if (!state?.enabled) return null;
  const rev = revision;
  const items = pendingActions(state);
  const pending = id ? items.find(item => item.id === id) : items[0];
  if (!pending) return null;
  state = { ...state, pending: undefined, pendingActions: items.filter(item => item.id !== pending.id) }; await persist(state);
  return rev === revision && state?.enabled && validPending(pending, state.scope) ? pending : null;
}
/** Inspect without acknowledging: network-dependent preparation can fail safely. */
export function peekAction(id: string): PendingAction | null {
  return state?.enabled ? pendingActions(state).find(item => item.id === id) ?? null : null;
}
