import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { notifications, tasks } from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { PushService } from '../../shared/push/push.service';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';

/** Tek turda işlenecek en fazla hatırlatma; sunucu uzun kapalı kaldıysa tur yine kısa kalsın. */
const BATCH = 200;

/**
 * Sunucu günlerce kapalı kaldıysa birikmiş hatırlatmaları toptan göndermek
 * kullanıcıyı bildirim yağmuruna tutar. Bu pencereden eskiler sessizce
 * "gönderildi" damgalanır — görev listede zaten gecikmiş görünüyor.
 */
const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Görev hatırlatmaları. Günlük özet işlerinden (automation.service) ayrı
 * duruyor: bunlar dakika hassasiyetinde ve kişiye özel — "15 dakika önce"
 * seçen kullanıcı 15 dakika önce haber bekler, ertesi sabah değil.
 */
@Injectable()
export class TaskRemindersService {
  private readonly env = loadEnv();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly push: PushService
  ) {}

  /** Dakikada bir. Saat dilimi gerekmiyor; her dakika çalışan ifade için anlamsız. */
  @Cron('* * * * *')
  async sweep(): Promise<void> {
    if (!this.env.AUTOMATION_ENABLED) return;
    try {
      await this.runOnce();
    } catch (error) {
      logger.error({ action: 'task_reminder_sweep_failed' }, String(error));
    }
  }

  /**
   * Zamanı gelen hatırlatmaları TEK atomik UPDATE ile sahiplenip sonra gönderir.
   * Önce okuyup sonra damgalamak, iki API örneği çalıştığında aynı hatırlatmanın
   * iki kez gitmesine açıktı. Dıştaki `reminder_sent_at is null` koşulu yarışı
   * kapatan şey: alt sorgunun anlık görüntüsü bayatlasa bile ikinci örnek
   * hiçbir satırı sahiplenemez.
   */
  async runOnce(now = new Date()): Promise<{ sent: number; skippedStale: number }> {
    const claimed = await this.db
      .update(tasks)
      .set({ reminderSentAt: now })
      .where(
        and(
          isNull(tasks.reminderSentAt),
          sql`${tasks.id} in (
            select id from tasks
            where deleted_at is null
              and reminder_sent_at is null
              and remind_before_minutes is not null
              and due_at is not null
              and assigned_to_user_id is not null
              and status in ('todo', 'in_progress')
              and due_at - make_interval(mins => remind_before_minutes) <= ${now}
            order by due_at
            limit ${BATCH}
          )`
        )
      )
      .returning();

    let sent = 0;
    let skippedStale = 0;
    for (const task of claimed) {
      const remindAt = task.dueAt!.getTime() - (task.remindBeforeMinutes ?? 0) * 60_000;
      if (now.getTime() - remindAt > STALE_MS) {
        skippedStale += 1;
        continue;
      }
      await this.notify(task, now);
      sent += 1;
    }

    if (sent || skippedStale) {
      logger.info({ action: 'task_reminders_sent', sent, skippedStale }, 'görev hatırlatmaları işlendi');
    }
    return { sent, skippedStale };
  }

  private async notify(task: typeof tasks.$inferSelect, now: Date) {
    const userId = task.assignedToUserId!;
    const due = task.dueAt!;
    const title = due.getTime() <= now.getTime() ? 'Görevin zamanı geldi' : 'Görev hatırlatması';
    const body = `${task.title} — son tarih ${this.formatWhen(due)}`;
    await this.db.insert(notifications).values({
      tenantId: task.tenantId,
      userId,
      divisionId: task.divisionId,
      type: 'task_reminder',
      title,
      body,
      entityType: 'task',
      entityId: task.id,
    });
    await this.push.sendToUser(userId, { title, body, data: { nav: 'tasks', entityId: task.id } });
  }

  private formatWhen(date: Date) {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: this.env.AUTOMATION_TIMEZONE,
    }).format(date);
  }
}
