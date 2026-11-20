import { z } from 'zod';

const sdp = z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().min(1).max(64 * 1024) });
export const incomingCallSchema = z.object({
  conversationId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  fromName: z.string().max(255),
  mode: z.enum(['audio', 'video']).default('audio'),
  offer: sdp.refine(value => value.type === 'offer'),
});
export const callAnswerSchema = z.object({
  conversationId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  answer: sdp.refine(value => value.type === 'answer'),
});
export const callIceSchema = z.object({
  conversationId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  candidate: z.object({
    candidate: z.string().max(16 * 1024),
    sdpMid: z.string().max(256).nullish(),
    sdpMLineIndex: z.number().int().nonnegative().nullish(),
  }),
});
export const callEndSchema = z.object({
  conversationId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  reason: z.string().max(64).optional(),
});
export const iceConfigurationSchema = z.object({
  iceServers: z.array(z.object({
    urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    username: z.string().optional(),
    credential: z.string().optional(),
  })).min(1).max(32),
  expiresAt: z.string().nullable(),
});
