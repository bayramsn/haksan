import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { afterDatabaseCommit } from '../../db/transaction-context';
import { DB } from '../database/database.module';
import { pushTokens } from '../../db/schema/users';
import { notifications } from '../../db/schema/companies';
import { logger } from '../utils/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PushMessage = { title: string; body: string; data?: Record<string, unknown> };

/**
 * Expo push bildirim servisi. Kimlik doğrulama gerektirmez (Expo push token
 * zaten hedefi tanımlar). Token yoksa sessizce no-op'tur.
 */
@Injectable()
export class PushService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  async registerToken(tenantId: string, userId: string, token: string, platform = 'expo'): Promise<void> {
    if (!token.startsWith('ExponentPushToken') && !token.startsWith('ExpoPushToken')) return;
    await this.db
      .insert(pushTokens)
      .values({ tenantId, userId, token, platform })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId, tenantId, lastSeenAt: new Date() },
      });
  }

  async removeToken(tenantId: string, userId: string, token: string): Promise<void> {
    await this.db
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, token), eq(pushTokens.tenantId, tenantId), eq(pushTokens.userId, userId)));
  }

  /** Bir kullanıcının tüm cihazlarına push gönderir. Hata halinde yutulur. */
  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    // Avoid ghost notifications if an assistant CRM/idempotency transaction rolls back.
    await afterDatabaseCommit(() => this.sendCommitted(userId, message));
  }

  private async sendCommitted(userId: string, message: PushMessage): Promise<void> {
    try {
      const rows = await this.db
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(eq(pushTokens.userId, userId));
      if (rows.length === 0) return;
      // Uygulama simgesi rozeti: kişiye özel okunmamış bildirimler. Uygulama açılınca listeyle eşitlenir.
      const [{ unread }] = await this.db
        .select({ unread: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
      await this.dispatch(rows.map((r) => r.token), message, unread);
    } catch (error) {
      logger.warn({ action: 'push_send_failed', userId }, String(error));
    }
  }

  private async dispatch(tokens: string[], message: PushMessage, badge?: number): Promise<void> {
    if (tokens.length === 0) return;
    const payload = tokens.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      sound: 'default',
      channelId: 'default',
      ...(badge !== undefined ? { badge } : {}),
    }));
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.warn({ action: 'push_expo_error', status: res.status }, await res.text().catch(() => ''));
      return;
    }
    // Expo geçersiz token'ları DeviceNotRegistered ile bildirir; temizle.
    const json = (await res.json().catch(() => null)) as { data?: Array<{ status: string; details?: { error?: string } }> } | null;
    const invalid: string[] = [];
    json?.data?.forEach((entry, i) => {
      if (entry.status === 'error' && entry.details?.error === 'DeviceNotRegistered') invalid.push(tokens[i]);
    });
    if (invalid.length > 0) {
      await this.db.delete(pushTokens).where(inArray(pushTokens.token, invalid));
    }
  }
}
