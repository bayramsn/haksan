import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/config/env', () => ({ loadEnv: () => ({ CORS_ORIGINS: ['http://localhost'] }) }));
import { ChatGateway } from '../src/modules/chat/chat.gateway';
const conversationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const peerId = '33333333-3333-4333-8333-333333333333';
function fixture(member = true) {
  const chat = { voiceCallContext: vi.fn(async () => member ? { peerIds: [peerId], callerName: 'Ahmet' } : null) };
  const realtime = { emitToUsers: vi.fn() };
  const socket = { data: { userId } as Record<string, unknown> };
  return { socket, chat, realtime, gateway: new ChatGateway({} as never, chat as never, realtime as never, {} as never) };
}
describe('call signaling boundaries', () => {
  it('forwards an authenticated offer to the verified DM peer', async () => {
    const { gateway, socket, realtime } = fixture();
    const offer = { type: 'offer', sdp: 'v=0\r\n' };
    expect(await gateway.onCallInvite(socket as never, { conversationId, offer, mode: 'video' })).toEqual({ ok: true });
    expect(realtime.emitToUsers).toHaveBeenCalledWith([peerId], 'call:incoming', { conversationId, fromUserId: userId, fromName: 'Ahmet', offer, mode: 'video' });
  });
  it('rejects malformed identifiers and descriptions before querying membership', async () => {
    const { gateway, socket, chat, realtime } = fixture();
    for (const value of [{ conversationId: 'bad', offer: { type: 'offer', sdp: 'v=0' } }, { conversationId, offer: { type: 'answer', sdp: 'v=0' } }, { conversationId, offer: { type: 'offer', sdp: 'x'.repeat(65537) } }]) {
      expect(await gateway.onCallInvite(socket as never, value)).toEqual({ ok: false });
    }
    expect(chat.voiceCallContext).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });
  it('rejects a valid signal when membership context is absent', async () => {
    const { gateway, socket, realtime } = fixture(false);
    expect(await gateway.onCallInvite(socket as never, { conversationId, offer: { type: 'offer', sdp: 'v=0' } })).toEqual({ ok: false });
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });
  it('limits control signals before more database work and resets the window', async () => {
    const { gateway, socket, chat } = fixture();
    for (let i = 0; i < 60; i++) expect(await gateway.onCallEnd(socket as never, { conversationId })).toEqual({ ok: true });
    expect(await gateway.onCallEnd(socket as never, { conversationId })).toEqual({ ok: false });
    expect(chat.voiceCallContext).toHaveBeenCalledTimes(60);
    socket.data.callControlWindow = { start: Date.now() - 60001, count: 60 };
    expect(await gateway.onCallEnd(socket as never, { conversationId })).toEqual({ ok: true });
  });
  it('rejects invalid ICE and bounds gathering independently from control signals', async () => {
    const { gateway, socket, chat } = fixture();
    expect(await gateway.onCallIce(socket as never, { conversationId, candidate: { candidate: 'a', sdpMLineIndex: -1 } })).toEqual({ ok: false });
    expect(chat.voiceCallContext).not.toHaveBeenCalled();
    for (let i = 0; i < 239; i++) await gateway.onCallIce(socket as never, { conversationId, candidate: { candidate: 'a', sdpMid: null } });
    expect(await gateway.onCallIce(socket as never, { conversationId, candidate: { candidate: 'a' } })).toEqual({ ok: false });
    expect(await gateway.onCallEnd(socket as never, { conversationId })).toEqual({ ok: true });
  });
  it('does not answer another user outside the verified DM pair', async () => {
    const { gateway, socket, realtime } = fixture();
    expect(await gateway.onCallAnswer(socket as never, { conversationId, to: userId, answer: { type: 'answer', sdp: 'v=0' } })).toEqual({ ok: false });
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });
});
