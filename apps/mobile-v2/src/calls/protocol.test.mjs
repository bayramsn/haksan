import assert from 'node:assert/strict';
import test from 'node:test';
import { incomingCallSchema, callAnswerSchema, callIceSchema, iceConfigurationSchema } from './protocol.ts';

const conversationId = '11111111-1111-4111-8111-111111111111';
const fromUserId = '22222222-2222-4222-8222-222222222222';
const incoming = { conversationId, fromUserId, fromName: 'Ahmet', offer: { type: 'offer', sdp: 'v=0\r\n' } };

test('legacy web invitations default to audio while explicit video survives validation', () => {
  assert.equal(incomingCallSchema.parse(incoming).mode, 'audio');
  assert.equal(incomingCallSchema.parse({ ...incoming, mode: 'video' }).mode, 'video');
});

test('invalid conversations, oversized SDP and answer-shaped offers cannot open incoming calls', () => {
  assert.equal(incomingCallSchema.safeParse({ ...incoming, conversationId: '../chat' }).success, false);
  assert.equal(incomingCallSchema.safeParse({ ...incoming, offer: { type: 'offer', sdp: 'x'.repeat(65537) } }).success, false);
  assert.equal(incomingCallSchema.safeParse({ ...incoming, offer: { type: 'answer', sdp: 'v=0' } }).success, false);
});

test('an answer must contain an answer description and an authenticated peer identifier', () => {
  assert.equal(callAnswerSchema.safeParse({ conversationId, fromUserId, answer: incoming.offer }).success, false);
  assert.equal(callAnswerSchema.safeParse({ conversationId, answer: { type: 'answer', sdp: 'v=0' } }).success, false);
});

test('ICE accepts browser null media identifiers and rejects oversized or invalid candidates', () => {
  const value = { conversationId, fromUserId, candidate: { candidate: 'candidate:1', sdpMid: null, sdpMLineIndex: null } };
  assert.equal(callIceSchema.safeParse(value).success, true);
  assert.equal(callIceSchema.safeParse({ ...value, candidate: { candidate: 'a'.repeat(16385) } }).success, false);
  assert.equal(callIceSchema.safeParse({ ...value, candidate: { candidate: 'a', sdpMLineIndex: -1 } }).success, false);
});

test('TURN configuration preserves ephemeral credentials and requires at least one server', () => {
  const iceServers = [{ urls: ['turns:relay.example.com:443'], username: 'ephemeral-user', credential: 'ephemeral-password' }];
  assert.deepEqual(iceConfigurationSchema.parse({ iceServers, expiresAt: null }).iceServers, iceServers);
  assert.equal(iceConfigurationSchema.safeParse({ iceServers: [], expiresAt: null }).success, false);
});
