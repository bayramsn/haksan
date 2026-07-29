import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { DB } from '../../shared/database/database.module';
import { MailerService } from '../../shared/mailer/mailer.service';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { tenants } from '../../db/schema/tenants';
import { companies, notifications } from '../../db/schema/companies';
import { receivables } from '../../db/schema/finance';
import { customerDevices, inventoryItems } from '../../db/schema/inventory';
import { productModels } from '../../db/schema/products';
import { quotes } from '../../db/schema/quotes';
import { maintenancePlans, serviceTickets } from '../../db/schema/service';
import { paymentStatuses, quoteStatuses, serviceTicketStatuses } from '../../db/schema/lookup';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Aynı gün içinde aynı tip bildirimi tekrar üretmeyi önleyen pencere. */
const DEDUPE_WINDOW_MS = 20 * 60 * 60 * 1000;
/** Dekoratör argümanı sınıf yüklenirken değerlendirilir; env buradan okunur. */
const TZ = loadEnv().AUTOMATION_TIMEZONE;

type TenantRow = { id: string; name: string };

/**
 * Zamanlanmış otomasyon işleri — vadesi geçen tahsilat, garanti bitişi,
 * cevapsız teklif ve sabah brifingi. Tüm işler "hesapla → bildirim üret →
 * (yapılandırılmışsa) e-posta gönder" desenini izler; hiçbir kaydı değiştirmez.
 */
@Injectable()
export class AutomationService {
  private readonly env = loadEnv();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly mailer: MailerService,
  ) {}

  private get active(): boolean {
    return this.env.AUTOMATION_ENABLED && process.env.NODE_ENV !== 'test';
  }

  private money(value: number): string {
    return `${Math.round(value).toLocaleString('tr-TR')}`;
  }

  private date(value: Date | null): string {
    return value ? value.toLocaleDateString('tr-TR') : '-';
  }

  private async listTenants(): Promise<TenantRow[]> {
    return this.db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  }

  /** Aynı tip bildirim son 20 saat içinde üretildiyse tekrar üretme. */
  private async alreadyNotified(tenantId: string, type: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.type, type),
          gte(notifications.createdAt, new Date(Date.now() - DEDUPE_WINDOW_MS)),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  private async notify(tenantId: string, type: string, title: string, body: string): Promise<void> {
    await this.db.insert(notifications).values({ tenantId, userId: null, divisionId: null, type, title, body });
  }

  private async sendDigestEmail(subject: string, text: string): Promise<void> {
    if (!this.env.AUTOMATION_DIGEST_EMAILS || !this.env.AUTOMATION_DIGEST_TO) return;
    if (!this.mailer.isConfigured()) return;
    const recipients = this.env.AUTOMATION_DIGEST_TO.split(',').map((s) => s.trim()).filter(Boolean);
    for (const to of recipients) {
      try {
        await this.mailer.sendTextEmail({ to, subject, text });
      } catch (error) {
        logger.warn({ action: 'automation_digest_mail_failed', to }, String(error));
      }
    }
  }

  // ---- Veri sorguları ----------------------------------------------------

  private async overdueReceivableStats(tenantId: string) {
    const [row] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${receivables.amount}), 0)::float`,
      })
      .from(receivables)
      .leftJoin(paymentStatuses, eq(receivables.statusId, paymentStatuses.id))
      .where(
        and(
          eq(receivables.tenantId, tenantId),
          isNull(receivables.deletedAt),
          lte(receivables.dueDate, new Date()),
          sql`(${paymentStatuses.code} is null or ${paymentStatuses.code} not in ('paid', 'cancelled'))`,
        ),
      );
    return row ?? { count: 0, total: 0 };
  }

  private async expiringWarranties(tenantId: string, windowDays: number) {
    return this.db
      .select({
        id: customerDevices.id,
        warrantyEndDate: customerDevices.warrantyEndDate,
        companyName: sql<string>`coalesce(nullif(${companies.shortName}, ''), ${companies.legalTitle})`,
      })
      .from(customerDevices)
      .innerJoin(companies, eq(customerDevices.companyId, companies.id))
      .where(
        and(
          eq(customerDevices.tenantId, tenantId),
          isNull(customerDevices.deletedAt),
          gte(customerDevices.warrantyEndDate, new Date()),
          lte(customerDevices.warrantyEndDate, new Date(Date.now() + windowDays * DAY_MS)),
        ),
      )
      .orderBy(asc(customerDevices.warrantyEndDate))
      .limit(50);
  }

  private async staleQuotes(tenantId: string, staleDays: number) {
    return this.db
      .select({
        id: quotes.id,
        documentNo: quotes.documentNo,
        updatedAt: quotes.updatedAt,
        companyName: sql<string>`coalesce(nullif(${companies.shortName}, ''), ${companies.legalTitle})`,
      })
      .from(quotes)
      .innerJoin(quoteStatuses, eq(quotes.statusId, quoteStatuses.id))
      .innerJoin(companies, eq(quotes.companyId, companies.id))
      .where(
        and(
          eq(quotes.tenantId, tenantId),
          isNull(quotes.deletedAt),
          eq(quoteStatuses.code, 'sent'),
          lte(quotes.updatedAt, new Date(Date.now() - staleDays * DAY_MS)),
        ),
      )
      .orderBy(asc(quotes.updatedAt))
      .limit(50);
  }

  private async openServiceTicketCount(tenantId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceTickets)
      .leftJoin(serviceTicketStatuses, eq(serviceTickets.statusId, serviceTicketStatuses.id))
      .where(
        and(
          eq(serviceTickets.tenantId, tenantId),
          isNull(serviceTickets.deletedAt),
          sql`(${serviceTicketStatuses.code} is null or ${serviceTicketStatuses.code} not in ('resolved', 'closed'))`,
        ),
      );
    return row?.count ?? 0;
  }

  // ---- Zamanlanmış işler -------------------------------------------------

  /** Hafta içi her sabah: günün özeti (tek bildirim + opsiyonel e-posta). */
  @Cron('0 8 * * 1-5', { timeZone: TZ })
  async morningBriefing(): Promise<void> {
    if (!this.active) return;
    try {
      for (const tenant of await this.listTenants()) {
        if (await this.alreadyNotified(tenant.id, 'daily_briefing')) continue;
        const [overdue, warranties, stale, openTickets] = await Promise.all([
          this.overdueReceivableStats(tenant.id),
          this.expiringWarranties(tenant.id, this.env.AUTOMATION_WARRANTY_WINDOW_DAYS),
          this.staleQuotes(tenant.id, this.env.AUTOMATION_STALE_QUOTE_DAYS),
          this.openServiceTicketCount(tenant.id),
        ]);
        const lines = [
          overdue.count > 0 ? `• ${overdue.count} geciken tahsilat (toplam ${this.money(overdue.total)})` : null,
          stale.length > 0 ? `• ${stale.length} teklif ${this.env.AUTOMATION_STALE_QUOTE_DAYS}+ gündür cevapsız` : null,
          openTickets > 0 ? `• ${openTickets} açık servis kaydı` : null,
          warranties.length > 0 ? `• ${warranties.length} makinenin garantisi ${this.env.AUTOMATION_WARRANTY_WINDOW_DAYS} gün içinde bitiyor` : null,
        ].filter(Boolean) as string[];
        const body = lines.length > 0 ? lines.join('\n') : 'Bekleyen kritik konu yok. İyi çalışmalar!';
        await this.notify(tenant.id, 'daily_briefing', 'Günaydın — günün özeti', body);
        await this.sendDigestEmail(`Haksan CRM sabah özeti — ${tenant.name}`, body);
      }
      logger.info({ action: 'automation_morning_briefing' }, '[automation] morning briefing done');
    } catch (error) {
      logger.error({ action: 'automation_morning_briefing_failed' }, String(error));
    }
  }

  /** Her gün: vadesi geçen tahsilatlar için tek toplu bildirim. */
  @Cron('15 8 * * *', { timeZone: TZ })
  async overdueReceivablesJob(): Promise<void> {
    if (!this.active) return;
    try {
      for (const tenant of await this.listTenants()) {
        if (await this.alreadyNotified(tenant.id, 'overdue_receivables')) continue;
        const stats = await this.overdueReceivableStats(tenant.id);
        if (stats.count === 0) continue;
        await this.notify(
          tenant.id,
          'overdue_receivables',
          `${stats.count} geciken tahsilat var`,
          `Toplam ${this.money(stats.total)} tutarında ${stats.count} alacağın vadesi geçti. Ödemeler sayfasından takip edebilirsiniz.`,
        );
      }
    } catch (error) {
      logger.error({ action: 'automation_overdue_failed' }, String(error));
    }
  }

  /** Her gün: garanti süresi yaklaşan makineler. */
  @Cron('30 8 * * *', { timeZone: TZ })
  async warrantyExpiryJob(): Promise<void> {
    if (!this.active) return;
    try {
      for (const tenant of await this.listTenants()) {
        if (await this.alreadyNotified(tenant.id, 'warranty_expiry')) continue;
        const rows = await this.expiringWarranties(tenant.id, this.env.AUTOMATION_WARRANTY_WINDOW_DAYS);
        if (rows.length === 0) continue;
        const preview = rows
          .slice(0, 3)
          .map((r) => `${r.companyName} (${this.date(r.warrantyEndDate)})`)
          .join(', ');
        await this.notify(
          tenant.id,
          'warranty_expiry',
          `${rows.length} makinenin garantisi bitmek üzere`,
          `${this.env.AUTOMATION_WARRANTY_WINDOW_DAYS} gün içinde garantisi bitecek makineler: ${preview}${rows.length > 3 ? '…' : ''}. Bakım anlaşması teklifi için uygun zaman.`,
        );
      }
    } catch (error) {
      logger.error({ action: 'automation_warranty_failed' }, String(error));
    }
  }

  /** Her gün: vadesi yaklaşan/geçen önleyici bakım planları. */
  @Cron('0 9 * * *', { timeZone: TZ })
  async maintenanceRemindersJob(): Promise<void> {
    if (!this.active) return;
    try {
      const rows = await this.db
        .select({
          plan: maintenancePlans,
          companyName: sql<string>`coalesce(nullif(${companies.shortName}, ''), ${companies.legalTitle})`,
          serialNumber: inventoryItems.serialNumber,
          model: productModels.modelName,
        })
        .from(maintenancePlans)
        .innerJoin(companies, eq(maintenancePlans.companyId, companies.id))
        .leftJoin(customerDevices, eq(maintenancePlans.customerDeviceId, customerDevices.id))
        .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
        .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
        .where(
          and(
            eq(maintenancePlans.isActive, true),
            isNull(maintenancePlans.deletedAt),
            // Vade, hatırlatma penceresi içinde
            sql`${maintenancePlans.nextDueDate} <= now() + (${maintenancePlans.reminderLeadDays} || ' days')::interval`,
            // Aynı gün tekrar hatırlatma
            sql`(${maintenancePlans.lastRemindedAt} is null or ${maintenancePlans.lastRemindedAt} < now() - interval '20 hours')`,
          ),
        )
        .limit(200);

      const openStatus = await this.db.query.serviceTicketStatuses.findFirst({
        where: eq(serviceTicketStatuses.code, 'open'),
      });

      for (const row of rows) {
        const machineLabel = [row.model, row.serialNumber ? `SN ${row.serialNumber}` : null].filter(Boolean).join(' · ') || 'makine';
        const overdue = row.plan.nextDueDate.getTime() <= Date.now();

        await this.notify(
          row.plan.tenantId,
          'maintenance_due',
          overdue ? `Bakım zamanı geldi: ${row.companyName}` : `Bakım yaklaşıyor: ${row.companyName}`,
          `${machineLabel} için "${row.plan.title}" planı ${this.date(row.plan.nextDueDate)} tarihinde. ${overdue ? 'Servis planlaması yapın.' : 'Yaklaşan periyodik bakım.'}`,
        );

        // Vade geçmiş ve otomatik talep açık ise servis kaydı oluştur, planı ilerlet.
        if (overdue && row.plan.autoCreateTicket && openStatus) {
          const ticketNo = `BKM-${new Date().getUTCFullYear()}-${row.plan.id.slice(0, 8)}`;
          const exists = await this.db.query.serviceTickets.findFirst({
            where: and(eq(serviceTickets.tenantId, row.plan.tenantId), eq(serviceTickets.ticketNo, ticketNo)),
          });
          if (!exists) {
            await this.db.insert(serviceTickets).values({
              tenantId: row.plan.tenantId,
              divisionId: row.plan.divisionId,
              ticketNo,
              companyId: row.plan.companyId,
              customerDeviceId: row.plan.customerDeviceId,
              subject: `Periyodik bakım — ${row.plan.title}`,
              description: `Otomatik oluşturuldu (bakım planı). Vade: ${this.date(row.plan.nextDueDate)}.`,
              severity: 'normal',
              ticketType: 'request',
              source: 'manual',
              statusId: openStatus.id,
            });
          }
          await this.db
            .update(maintenancePlans)
            .set({ nextDueDate: new Date(Date.now() + row.plan.intervalDays * DAY_MS), lastRemindedAt: new Date() })
            .where(eq(maintenancePlans.id, row.plan.id));
        } else {
          await this.db
            .update(maintenancePlans)
            .set({ lastRemindedAt: new Date() })
            .where(eq(maintenancePlans.id, row.plan.id));
        }
      }
    } catch (error) {
      logger.error({ action: 'automation_maintenance_failed' }, String(error));
    }
  }

  /** Her gün: gönderilmiş ama cevapsız kalmış teklifler. */
  @Cron('45 8 * * *', { timeZone: TZ })
  async staleQuotesJob(): Promise<void> {
    if (!this.active) return;
    try {
      for (const tenant of await this.listTenants()) {
        if (await this.alreadyNotified(tenant.id, 'stale_quotes')) continue;
        const rows = await this.staleQuotes(tenant.id, this.env.AUTOMATION_STALE_QUOTE_DAYS);
        if (rows.length === 0) continue;
        const preview = rows
          .slice(0, 3)
          .map((r) => `${r.documentNo} (${r.companyName})`)
          .join(', ');
        await this.notify(
          tenant.id,
          'stale_quotes',
          `${rows.length} teklif ${this.env.AUTOMATION_STALE_QUOTE_DAYS}+ gündür cevapsız`,
          `Takip bekleyen teklifler: ${preview}${rows.length > 3 ? '…' : ''}. Müşteriyi aramak kazanma oranını belirgin artırır.`,
        );
      }
    } catch (error) {
      logger.error({ action: 'automation_stale_quotes_failed' }, String(error));
    }
  }
}
