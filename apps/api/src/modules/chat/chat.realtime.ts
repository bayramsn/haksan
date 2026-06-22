import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Sohbet gerçek-zaman yayın köprüsü. Gateway aktifse (CHAT_REALTIME_ENABLED=true)
 * sunucu referansını alır ve odalara yayın yapar; aktif değilse tüm metotlar
 * no-op'tur (polling fallback devrede kalır). ChatService bunu daima enjekte eder.
 */
@Injectable()
export class ChatRealtimeService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  get enabled(): boolean {
    return this.server !== null;
  }

  /** Belirli bir konuşmayı açık tutan soketlere (oda: conv:<id>) yayınla. */
  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.server?.to(`conv:${conversationId}`).emit(event, payload);
  }

  /** Kullanıcıların tüm soketlerine (oda: user:<id>) yayınla — konuşma listesi/rozet. */
  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    if (!this.server) return;
    for (const uid of userIds) this.server.to(`user:${uid}`).emit(event, payload);
  }
}
