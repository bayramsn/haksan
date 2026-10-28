import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { api, getAccessToken, refreshSession, RequestScopeChangedError, setAccessToken, setActiveDepartment, setActiveDivision } from './apiClient';

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); setActiveDivision(null); setActiveDepartment(null); });

describe('web request context boundaries', () => {
  it('rejects old-division response even after switching back to that division', async () => {
    setAccessToken('alice'); setActiveDivision('cnc'); const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const request = api.get('/products'); setActiveDivision('sac'); setActiveDivision('cnc'); pending.resolve(json({ secret: 'old' }));
    await expect(request).rejects.toBeInstanceOf(RequestScopeChangedError);
  });
  it('does not execute old-context requests waiting behind scheduler slots', async () => {
    setAccessToken('alice'); const pending = deferred<Response>(); const fetch = vi.fn(() => pending.promise); vi.stubGlobal('fetch', fetch);
    const requests = Array.from({ length: 9 }, () => api.get('/products'));
    const results = Promise.allSettled(requests);
    expect(fetch).toHaveBeenCalledTimes(8);
    setActiveDepartment('service'); pending.resolve(json({ data: [] }));
    expect((await results).every(row => row.status === 'rejected' && row.reason instanceof RequestScopeChangedError)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(8);
  });
  it('cannot install delayed previous-account refresh token', async () => {
    setAccessToken('alice'); const pending = deferred<Response>(); vi.stubGlobal('fetch', () => pending.promise);
    const refresh = refreshSession(); setAccessToken('bob'); pending.resolve(json({ accessToken: 'old-refreshed-alice' }));
    await expect(refresh).rejects.toBeInstanceOf(RequestScopeChangedError); expect(getAccessToken()).toBe('bob');
  });
  it('refreshes and retries normal requests without crossing context', async () => {
    setAccessToken('expired'); const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(json({ accessToken: 'fresh' })).mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal('fetch', fetch); await expect(api.get('/products')).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh');
  });
  it('rejects response body that finishes parsing after scope changes', async () => {
    setAccessToken('alice'); const body = deferred<unknown>(); vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: () => body.promise }));
    const request = api.get('/products'); await new Promise(r => setImmediate(r)); setActiveDivision('sac'); body.resolve({ old: true });
    await expect(request).rejects.toBeInstanceOf(RequestScopeChangedError);
  });
});

it('remounting a cleared same-key observer fetches the new department', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  let department = 'sales'; const calls: string[] = [];
  const options = { queryKey: ['products'], queryFn: async () => { calls.push(department); return department; } };
  const first = new QueryObserver(client, options); const stop = first.subscribe(() => {}); await new Promise(r => setImmediate(r));
  department = 'service'; client.clear(); stop(); first.destroy();
  const next = new QueryObserver(client, options); const stopNext = next.subscribe(() => {}); await new Promise(r => setImmediate(r));
  expect(calls).toEqual(['sales', 'service']); expect(next.getCurrentResult().data).toBe('service');
  stopNext(); next.destroy(); client.clear();
});
