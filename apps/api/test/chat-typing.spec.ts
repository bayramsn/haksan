import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/config/env', () => ({ loadEnv: () => ({ CORS_ORIGINS: ['http://localhost'] }) }));
import { ChatGateway } from '../src/modules/chat/chat.gateway';

const conversationId = '00000000-0000-4000-8000-000000000001';
function fixture(member = true) {
  const emit = vi.fn();
  const socket = { data: { userId: 'user-1' } as Record<string, unknown>, to: vi.fn(() => ({ emit })) };
  const chat = { typingContext: vi.fn(async () => member ? { fullName: 'Ahmet' } : null) };
  const gateway = new ChatGateway({} as never, chat as never, {} as never, {} as never);
  return { gateway, chat, socket, emit };
}

describe('ephemeral chat typing', () => {
  it('broadcasts authenticated names after membership validation with a five second TTL', async () => {
    const { gateway, socket, chat, emit } = fixture();
    const before = Date.now();
    expect(await gateway.onTyping(socket as never, { conversationId, isTyping: true })).toEqual({ ok: true });
    expect(chat.typingContext).toHaveBeenCalledWith('user-1', conversationId);
    const [event, value] = emit.mock.calls[0];
    expect(event).toBe('typing:update');
    expect(value).toMatchObject({ conversationId, userId: 'user-1', fullName: 'Ahmet', isTyping: true });
    expect(value.expiresAt).toBeGreaterThanOrEqual(before + 5000);
    expect(value.expiresAt).toBeLessThanOrEqual(Date.now() + 5000);
  });
  it('rejects malformed payloads and nonmembers without broadcasting', async () => {
    const { gateway, socket, emit } = fixture(false);
    expect(await gateway.onTyping(socket as never, { conversationId, isTyping: true })).toEqual({ ok: false });
    expect(await gateway.onTyping(socket as never, { conversationId: 'bad', isTyping: true })).toEqual({ ok: false });
    expect(await gateway.onTyping(socket as never, { conversationId, isTyping: 'yes' })).toEqual({ ok: false });
    expect(emit).not.toHaveBeenCalled();
  });
  it('bounds connection updates before additional DB work', async () => {
    const { gateway, socket, chat } = fixture();
    for (let i = 0; i < 60; i++) await gateway.onTyping(socket as never, { conversationId, isTyping: true });
    expect(await gateway.onTyping(socket as never, { conversationId, isTyping: true })).toMatchObject({ ok: false, retryAfter: expect.any(Number) });
    expect(chat.typingContext).toHaveBeenCalledTimes(60);
  });
});
