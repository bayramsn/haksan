import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Server, Socket } from 'socket.io';
import { ChatGateway } from '../src/modules/chat/chat.gateway';

vi.mock('../src/config/env', () => ({ loadEnv: () => ({ CORS_ORIGINS: ['http://localhost'] }) }));

const userId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const fixture = (lifetimeSeconds = 60) => {
  const limit = vi.fn().mockResolvedValue([{ id: sessionId }]);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  const db = { select: vi.fn().mockReturnValue({ from }) };
  const jwt = {
    verifyAccess: vi.fn().mockReturnValue({
      sub: userId, tid: tenantId, sid: sessionId, ver: 7, exp: Date.now() / 1000 + lifetimeSeconds,
    }),
  };
  const gateway = new ChatGateway(jwt as never, {} as never, { setServer: vi.fn() } as never, db as never);
  const server = { use: vi.fn() };
  gateway.afterInit(server as unknown as Server);

  let cleanup: (() => void) | undefined;
  const socket = {
    data: {} as Record<string, unknown>,
    handshake: { auth: { token: 'test-jwt' } },
    join: vi.fn(),
    connected: true,
    conn: { close: vi.fn(() => disconnect()) },
    disconnect: vi.fn(() => disconnect()),
    once: vi.fn((_event: string, onDisconnect: () => void) => { cleanup = onDisconnect; }),
  };
  function disconnect() {
    socket.connected = false;
    cleanup?.();
  }
  const next = vi.fn();
  const authenticate = () => server.use.mock.calls[0][0](socket, next) as Promise<void>;
  const connect = () => gateway.handleConnection(socket as unknown as Socket);
  return { socket, connect, authenticate, next, jwt, limit, where, disconnect };
};

describe('chat socket sessions', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  it('binds the user room to a live session, active user, tenant and auth version', async () => {
    const { socket, connect, authenticate, next, where } = fixture();
    await authenticate();
    expect(next).toHaveBeenCalledWith();
    const { sql, params } = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(sql).toContain('"login_sessions"."revoked_at" is null');
    expect(sql).toContain('"users"."deleted_at" is null');
    expect(sql).toContain('"users"."tenant_id"');
    expect(sql).toContain('"users"."auth_version"');
    expect(params).toEqual([sessionId, userId, tenantId, tenantId, 7, 'active']);
    connect();
    expect(socket.join).toHaveBeenCalledWith(`user:${userId}`);
  });

  it('rejects a revoked or otherwise invalid session before joining any room', async () => {
    const { socket, connect, authenticate, next, limit } = fixture();
    limit.mockResolvedValueOnce([]);
    await authenticate();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    connect();
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects an established socket when its session is revoked', async () => {
    const { socket, connect, authenticate, limit } = fixture();
    await authenticate();
    connect();
    limit.mockResolvedValueOnce([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes the transport at JWT expiry and identifies expired handshakes for renewal', async () => {
    const { socket, connect, authenticate, next, jwt } = fixture(3);
    await authenticate();
    connect();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(socket.conn.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    jwt.verifyAccess.mockImplementationOnce(() => { throw Object.assign(new Error('expired'), { name: 'TokenExpiredError' }); });
    await authenticate();
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ data: { code: 'CHAT_ACCESS_EXPIRED' } }));
  });

  it('fails closed if the session lookup stalls and stops polling on disconnect', async () => {
    const { socket, connect, authenticate, limit } = fixture();
    await authenticate();
    connect();
    limit.mockReturnValueOnce(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);

    const next = fixture();
    await next.authenticate();
    next.connect();
    next.disconnect();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(next.limit).toHaveBeenCalledOnce();
  });
});
