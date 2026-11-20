import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtTokenService } from '../../shared/security/jwt.service';
import { ChatService } from './chat.service';
import { ChatRealtimeService } from './chat.realtime';
import { loadEnv } from '../../config/env';
import { z } from 'zod';
import { logger } from '../../shared/utils/logger';

/**
 * Socket.IO ağ geçidi — yalnızca CHAT_REALTIME_ENABLED=true iken ChatModule
 * tarafından sağlanır (aksi halde hiç örneklenmez, soket sunucusu açılmaz).
 * El sıkışmada JWT ve oturum doğrulanır. Açık bağlantılar oturum iptalini izler.
 */
@WebSocketGateway({ cors: { origin: loadEnv().CORS_ORIGINS, credentials: true } })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtTokenService,
    private readonly chat: ChatService,
    private readonly realtime: ChatRealtimeService
  ) {}

  private isSafeSignal(value: unknown, maxBytes: number): boolean {
    if (!value || typeof value !== 'object') return false;
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8') <= maxBytes;
    } catch {
      return false;
    }
  }

  private acceptCallSignal(socket: Socket, conversationId: unknown, ice = false): boolean {
    if (!socket.data.userId || !z.string().uuid().safeParse(conversationId).success) return false;
    const key = ice ? 'callIceWindow' : 'callControlWindow';
    const now = Date.now();
    const window = socket.data[key] as { start: number; count: number } | undefined;
    if (!window || now - window.start >= 60_000) {
      socket.data[key] = { start: now, count: 1 };
      return true;
    }
    // ICE gathering needs a larger burst than invitation/control events.
    return ++window.count <= (ice ? 240 : 60);
  }

  private isDescription(value: unknown, type: 'offer' | 'answer'): boolean {
    return z.object({ type: z.literal(type), sdp: z.string().min(1).max(65536) }).safeParse(value).success
      && this.isSafeSignal(value, 64 * 1024);
  }

  afterInit(server: Server): void {
    this.realtime.setServer(server);
    logger.info('[chat] realtime gateway up');
  }

  handleConnection(socket: Socket): void {
    try {
      const token = (socket.handshake.auth?.token as string) || '';
      const payload = this.jwt.verifyAccess(token);
      socket.data.userId = payload.sub;
      socket.data.tenantId = payload.tid;
      socket.join(`user:${payload.sub}`);
    } catch {
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('join')
  async onJoin(@ConnectedSocket() socket: Socket, @MessageBody() data: { conversationId?: string }) {
    const userId = socket.data.userId as string | undefined;
    if (!userId || !data?.conversationId) return { ok: false };
    const member = await this.chat.isMember(userId, data.conversationId);
    if (!member) return { ok: false };
    socket.join(`conv:${data.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('leave')
  onLeave(@ConnectedSocket() socket: Socket, @MessageBody() data: { conversationId?: string }) {
    if (data?.conversationId) socket.leave(`conv:${data.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing:set')
  async onTyping(@ConnectedSocket() socket: Socket, @MessageBody() data: unknown) {
    const parsed = z.object({ conversationId: z.string().uuid(), isTyping: z.boolean() }).safeParse(data);
    const userId = socket.data.userId as string | undefined;
    if (!parsed.success || !userId) return { ok: false };
    const now = Date.now();
    const window = socket.data.typingWindow as { start: number; count: number } | undefined;
    if (!window || now - window.start >= 60_000) socket.data.typingWindow = { start: now, count: 1 };
    else if (++window.count > 60) return { ok: false, retryAfter: Math.ceil((60_000 - (now - window.start)) / 1000) };
    const ctx = await this.chat.typingContext(userId, parsed.data.conversationId);
    if (!ctx) return { ok: false };
    socket.to(`conv:${parsed.data.conversationId}`).emit('typing:update', {
      ...parsed.data, userId, fullName: ctx.fullName, expiresAt: now + 5000,
    });
    return { ok: true };
  }

  // ───────── Sesli/görüntülü arama sinyalleşmesi (WebRTC, yalnız DM) ─────────
  // Sunucu yalnız aracıdır: SDP/ICE biçimi ve boyutu doğrulanır,
  // medya sunucudan geçmez. Her olayda gönderenin üyeliği doğrulanır.

  @SubscribeMessage('call:invite')
  async onCallInvite(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId?: string; offer?: unknown; mode?: unknown },
  ) {
    const userId = socket.data.userId as string | undefined;
    if (!this.acceptCallSignal(socket, data?.conversationId) || !userId || !data?.conversationId || !this.isDescription(data.offer, 'offer')) return { ok: false };
    const ctx = await this.chat.voiceCallContext(userId, data.conversationId);
    if (!ctx) return { ok: false };
    const mode = data.mode === 'video' ? 'video' : data.mode === 'audio' || data.mode == null ? 'audio' : null;
    if (!mode) return { ok: false };
    this.realtime.emitToUsers(ctx.peerIds, 'call:incoming', {
      conversationId: data.conversationId,
      fromUserId: userId,
      fromName: ctx.callerName,
      offer: data.offer,
      mode,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:answer')
  async onCallAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId?: string; to?: string; answer?: unknown },
  ) {
    const userId = socket.data.userId as string | undefined;
    if (!this.acceptCallSignal(socket, data?.conversationId) || !userId || !data?.conversationId || !z.string().uuid().safeParse(data.to).success || !data.to || !this.isDescription(data.answer, 'answer')) return { ok: false };
    const ctx = await this.chat.voiceCallContext(userId, data.conversationId);
    if (!ctx || !ctx.peerIds.includes(data.to)) return { ok: false };
    this.realtime.emitToUsers([data.to], 'call:answer', {
      conversationId: data.conversationId,
      fromUserId: userId,
      answer: data.answer,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:ice')
  async onCallIce(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId?: string; candidate?: unknown },
  ) {
    const userId = socket.data.userId as string | undefined;
    if (!this.acceptCallSignal(socket, data?.conversationId, true) || !userId || !data?.conversationId || !z.object({ candidate: z.string().max(16384), sdpMid: z.string().max(256).nullish(), sdpMLineIndex: z.number().int().min(0).max(65535).nullish() }).safeParse(data.candidate).success || !this.isSafeSignal(data.candidate, 16 * 1024)) return { ok: false };
    const ctx = await this.chat.voiceCallContext(userId, data.conversationId);
    if (!ctx) return { ok: false };
    this.realtime.emitToUsers(ctx.peerIds, 'call:ice', {
      conversationId: data.conversationId,
      fromUserId: userId,
      candidate: data.candidate,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:reject')
  async onCallReject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId?: string; reason?: string },
  ) {
    const userId = socket.data.userId as string | undefined;
    if (!this.acceptCallSignal(socket, data?.conversationId) || !userId || !data?.conversationId) return { ok: false };
    const ctx = await this.chat.voiceCallContext(userId, data.conversationId);
    if (!ctx) return { ok: false };
    this.realtime.emitToUsers(ctx.peerIds, 'call:reject', {
      conversationId: data.conversationId,
      fromUserId: userId,
      reason: data.reason === 'busy' ? 'busy' : 'declined',
    });
    return { ok: true };
  }

  @SubscribeMessage('call:end')
  async onCallEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId?: string },
  ) {
    const userId = socket.data.userId as string | undefined;
    if (!this.acceptCallSignal(socket, data?.conversationId) || !userId || !data?.conversationId) return { ok: false };
    const ctx = await this.chat.voiceCallContext(userId, data.conversationId);
    if (!ctx) return { ok: false };
    this.realtime.emitToUsers(ctx.peerIds, 'call:end', {
      conversationId: data.conversationId,
      fromUserId: userId,
    });
    return { ok: true };
  }
}
