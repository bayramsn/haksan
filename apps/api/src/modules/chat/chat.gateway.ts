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
import { logger } from '../../shared/utils/logger';

/**
 * Socket.IO ağ geçidi — yalnızca CHAT_REALTIME_ENABLED=true iken ChatModule
 * tarafından sağlanır (aksi halde hiç örneklenmez, soket sunucusu açılmaz).
 * El sıkışmada JWT doğrulanır; istemci `join`/`leave` ile konuşma odalarına girer.
 */
@WebSocketGateway({ cors: { origin: loadEnv().CORS_ORIGINS, credentials: true } })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtTokenService,
    private readonly chat: ChatService,
    private readonly realtime: ChatRealtimeService
  ) {}

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

  // ───────── Sesli arama sinyalleşmesi (WebRTC, yalnız DM) ─────────
  // Sunucu yalnız aracıdır: SDP/ICE içeriği doğrulanmadan karşı üyeye iletilir,
  // medya sunucudan geçmez. Her olayda gönderenin üyeliği doğrulanır.

  @SubscribeMessage('call:invite')
  async onCallInvite(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId?: string; offer?: unknown },
  ) {
    const userId = socket.data.userId as string | undefined;
    if (!userId || !data?.conversationId || !data.offer) return { ok: false };
    const ctx = await this.chat.voiceCallContext(userId, data.conversationId);
    if (!ctx) return { ok: false };
    this.realtime.emitToUsers(ctx.peerIds, 'call:incoming', {
      conversationId: data.conversationId,
      fromUserId: userId,
      fromName: ctx.callerName,
      offer: data.offer,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:answer')
  async onCallAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId?: string; to?: string; answer?: unknown },
  ) {
    const userId = socket.data.userId as string | undefined;
    if (!userId || !data?.conversationId || !data.to || !data.answer) return { ok: false };
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
    if (!userId || !data?.conversationId || !data.candidate) return { ok: false };
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
    if (!userId || !data?.conversationId) return { ok: false };
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
    if (!userId || !data?.conversationId) return { ok: false };
    const ctx = await this.chat.voiceCallContext(userId, data.conversationId);
    if (!ctx) return { ok: false };
    this.realtime.emitToUsers(ctx.peerIds, 'call:end', {
      conversationId: data.conversationId,
      fromUserId: userId,
    });
    return { ok: true };
  }
}
