import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { and, asc, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  MAIL_CAMPAIGN_MAX_CANDIDATES,
  MAIL_MAX_ATTACHMENT_BYTES,
  type MailCampaignCandidatesQuery,
  type MailCampaignCreateInput,
  type MailRecipientListParseInput,
  type MailSuppressionInput,
} from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { companies, companyEmails, contacts } from '../../db/schema/companies';
import { fileLinks, files } from '../../db/schema/files';
import { mailCampaignRecipients, mailCampaigns, mailSuppressions } from '../../db/schema/mail';
import { users } from '../../db/schema/users';
import { loadEnv } from '../../config/env';
import { DB } from '../../shared/database/database.module';
import { UserMailAccountService } from '../../shared/mailer/user-mail-account.service';
import { rolePermissionsCacheKey } from '../../shared/security/rbac.cache';
import type { AuthContext } from '../../shared/security/auth.types';
import { companyVisibilityFilter } from '../../shared/utils/company-visibility';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { logger } from '../../shared/utils/logger';
import { detectHeaderRow, normalizeText, readSpreadsheetMatrix } from '../../shared/utils/spreadsheet-import';
import { ActivitiesService } from '../activities/activities.service';
import { CompaniesService } from '../companies/companies.service';
import { FilesService } from '../files/files.service';

/** Tur başına alıcı; 20 sn'de bir tur ≈ dakikada 21 ileti, kişisel SMTP kotalarının altında. */
const BATCH = 7;
/** Bu süreden eski "gönderiliyor" satırı yarıda kalmıştır; teslim belirsiz olduğu için tekrar gönderilmez. */
const STALE_CLAIM_MS = 10 * 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type ActorSnapshot = Omit<AuthContext, 'permissions' | 'sessionId'> & { permissions: string[] };

const snapshot = ({ permissions, sessionId: _session, ...rest }: AuthContext): ActorSnapshot => ({ ...rest, permissions: [...permissions] });
const restore = (value: unknown): AuthContext => {
  const snap = value as ActorSnapshot;
  return { ...snap, permissions: new Set(snap.permissions) };
};

/** `{{ad}}` / `{{firma}}` alıcıya göre dolar; boşsa önündeki boşlukla birlikte düşer ("Merhaba {{ad}}," → "Merhaba,"). */
export function fillPlaceholders(text: string, recipient: { name?: string | null; companyName?: string | null }): string {
  const fill = (source: string, key: string, value?: string | null) =>
    source.replace(new RegExp(`([ \\t]?)\\{\\{\\s*${key}\\s*\\}\\}`, 'giu'), (_m, space: string) => (value?.trim() ? `${space}${value.trim()}` : ''));
  return fill(fill(text, 'ad', recipient.name), 'firma', recipient.companyName);
}

/** Herkese açık adres yoksa (yerel geliştirme) bağlantı eklenmez; üretimde APP_PUBLIC_URL zorunlu. */
export function unsubscribeLinks(token: string, env = loadEnv()) {
  if (!env.APP_PUBLIC_URL) return undefined;
  return {
    pageUrl: new URL(`/public/unsubscribe/${token}`, env.APP_PUBLIC_URL).toString(),
    oneClickUrl: new URL(`${env.API_PREFIX.replace(/\/$/, '')}/public/mail-unsubscribe/${token}`, env.APP_PUBLIC_URL).toString(),
  };
}

const isCampaignAdmin = (actor: AuthContext) => actor.roles.includes('super_admin') || actor.roles.includes('admin');

@Injectable()
export class MailCampaignsService {
  private running = false;

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly accounts: UserMailAccountService,
    private readonly files: FilesService,
    private readonly activities: ActivitiesService,
    private readonly companiesService: CompaniesService
  ) {}

  async create(input: MailCampaignCreateInput, actor: AuthContext) {
    if (!(await this.accounts.hasActiveAccount(actor))) {
      throw new ValidationError('Önce Ayarlar > Webmail bölümünden posta hesabınızı bağlayın');
    }
    await this.assertNoRunning(actor);
    const fileIds = [...new Set(input.fileIds ?? [])];
    await this.assertCatalogFiles(fileIds, actor);

    // Aynı adrese iki kez gitmesin; ilk kayıt (CRM bağlantılı olabilir) kalır.
    const byEmail = new Map<string, MailCampaignCreateInput['recipients'][number]>();
    for (const recipient of input.recipients) {
      const email = recipient.email.toLocaleLowerCase('en-US');
      if (!byEmail.has(email)) byEmail.set(email, { ...recipient, email });
    }
    const recipients = await this.verifiedCrmLinks([...byEmail.values()], actor);

    const suppressed = new Set(
      (await this.db.select({ email: mailSuppressions.email }).from(mailSuppressions)
        .where(and(eq(mailSuppressions.tenantId, actor.tenantId), inArray(mailSuppressions.email, [...byEmail.keys()]))))
        .map((row) => row.email)
    );

    const campaign = await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(mailCampaigns).values({
        tenantId: actor.tenantId,
        createdBy: actor.userId,
        subject: input.subject,
        body: input.body,
        fileIds,
        actor: snapshot(actor),
      }).returning();
      await tx.insert(mailCampaignRecipients).values(recipients.map((recipient) => ({
        campaignId: created.id,
        email: recipient.email,
        name: recipient.name || null,
        companyName: recipient.companyName || null,
        companyId: recipient.companyId ?? null,
        contactId: recipient.contactId ?? null,
        ...(suppressed.has(recipient.email) ? { status: 'skipped', error: 'Toplu mail almak istemiyor' } : {}),
      })));
      return created;
    });
    logger.info({ action: 'mail_campaign_created', campaignId: campaign.id, userId: actor.userId, recipients: recipients.length, skipped: suppressed.size }, '[mail] campaign queued');
    return this.get(campaign.id, actor);
  }

  /** Firmalar listesiyle aynı görünürlük ve süzgeçlerden geçen, e-postası olan kontaklar (ve istenirse firma e-postaları). */
  async candidates(query: MailCampaignCandidatesQuery, actor: AuthContext) {
    const where = await this.companiesService.listWhere(actor, query);
    const companyName = sql<string>`coalesce(${companies.shortName}, ${companies.legalTitle})`;
    // Kara listedeki firmaya toplu mail gitmez ("Durum: tümü" seçiliyken de).
    const notBlacklistedCompany = sql`${companies.customerStatusId} is distinct from (select id from company_statuses where code = 'blacklist' limit 1)`;
    const contactEmail = sql<string>`coalesce(nullif(trim(${contacts.workEmail}), ''), nullif(trim(${contacts.personalEmail}), ''), nullif(trim(${contacts.otherEmail}), ''))`;
    const contactRows = await this.db
      .select({ contactId: contacts.id, name: contacts.fullName, title: contacts.title, email: contactEmail, companyId: companies.id, companyName })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .where(and(where, eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt), eq(contacts.isBlacklisted, false), notBlacklistedCompany, sql`${contactEmail} is not null`))
      .orderBy(asc(companyName), asc(contacts.fullName))
      .limit(MAIL_CAMPAIGN_MAX_CANDIDATES + 1);
    const companyRows = query.includeCompanyEmails
      ? await this.db
        .selectDistinctOn([companyEmails.companyId, companyEmails.email], { email: companyEmails.email, companyId: companies.id, companyName })
        .from(companyEmails)
        .innerJoin(companies, eq(companies.id, companyEmails.companyId))
        .where(and(where, notBlacklistedCompany, eq(companyEmails.tenantId, actor.tenantId), isNull(companyEmails.deletedAt)))
        .limit(MAIL_CAMPAIGN_MAX_CANDIDATES + 1)
      : [];
    const rows = [
      ...contactRows.map((row) => ({ email: row.email.trim(), name: row.name, companyName: row.companyName, companyId: row.companyId, contactId: row.contactId, detail: row.title ?? null })),
      ...companyRows.map((row) => ({ email: row.email.trim(), name: null, companyName: row.companyName, companyId: row.companyId, contactId: null, detail: 'Firma e-postası' })),
    ].filter((row) => EMAIL_RE.test(row.email));
    return { rows: rows.slice(0, MAIL_CAMPAIGN_MAX_CANDIDATES), truncated: rows.length > MAIL_CAMPAIGN_MAX_CANDIDATES };
  }

  async list(actor: AuthContext) {
    const counts = this.db
      .select({
        campaignId: mailCampaignRecipients.campaignId,
        total: count().as('total'),
        sent: sql<number>`count(*) filter (where ${mailCampaignRecipients.status} = 'sent')`.mapWith(Number).as('sent'),
        failed: sql<number>`count(*) filter (where ${mailCampaignRecipients.status} = 'failed')`.mapWith(Number).as('failed'),
        skipped: sql<number>`count(*) filter (where ${mailCampaignRecipients.status} = 'skipped')`.mapWith(Number).as('skipped'),
      })
      .from(mailCampaignRecipients)
      .groupBy(mailCampaignRecipients.campaignId)
      .as('counts');
    return this.db
      .select({
        id: mailCampaigns.id,
        subject: mailCampaigns.subject,
        status: mailCampaigns.status,
        error: mailCampaigns.error,
        createdAt: mailCampaigns.createdAt,
        completedAt: mailCampaigns.completedAt,
        createdBy: mailCampaigns.createdBy,
        createdByName: users.fullName,
        total: counts.total,
        sent: counts.sent,
        failed: counts.failed,
        skipped: counts.skipped,
      })
      .from(mailCampaigns)
      .innerJoin(counts, eq(counts.campaignId, mailCampaigns.id))
      .leftJoin(users, eq(users.id, mailCampaigns.createdBy))
      .where(and(eq(mailCampaigns.tenantId, actor.tenantId), isCampaignAdmin(actor) ? undefined : eq(mailCampaigns.createdBy, actor.userId)))
      .orderBy(desc(mailCampaigns.createdAt))
      .limit(100);
  }

  async get(id: string, actor: AuthContext) {
    const campaign = await this.findVisible(id, actor);
    const recipients = await this.db
      .select({
        id: mailCampaignRecipients.id,
        email: mailCampaignRecipients.email,
        name: mailCampaignRecipients.name,
        companyName: mailCampaignRecipients.companyName,
        companyId: mailCampaignRecipients.companyId,
        status: mailCampaignRecipients.status,
        error: mailCampaignRecipients.error,
        sentAt: mailCampaignRecipients.sentAt,
      })
      .from(mailCampaignRecipients)
      .where(eq(mailCampaignRecipients.campaignId, id))
      .orderBy(asc(mailCampaignRecipients.email));
    const { actor: _actor, ...rest } = campaign;
    return { ...rest, recipients };
  }

  async cancel(id: string, actor: AuthContext) {
    const campaign = await this.findVisible(id, actor);
    if (campaign.status !== 'sending') throw new ValidationError('Yalnız gönderimi süren toplu mail durdurulabilir');
    await this.db.update(mailCampaigns).set({ status: 'cancelled', completedAt: new Date() })
      .where(and(eq(mailCampaigns.id, id), eq(mailCampaigns.status, 'sending')));
    return this.get(id, actor);
  }

  /** Durmuş gönderimin bekleyen alıcılarını yeniden kuyruğa alır (ör. webmail hesabı yeniden bağlandıktan sonra). */
  async resume(id: string, actor: AuthContext) {
    const campaign = await this.findVisible(id, actor);
    if (campaign.status === 'sending' || campaign.status === 'completed') throw new ValidationError('Bu gönderim zaten sürüyor veya tamamlandı');
    if (campaign.createdBy !== actor.userId) throw new ForbiddenError('Gönderimi yalnız başlatan kişi sürdürebilir');
    if (!(await this.accounts.hasActiveAccount(actor))) throw new ValidationError('Önce Ayarlar > Webmail bölümünden posta hesabınızı bağlayın');
    await this.assertNoRunning(actor);
    await this.db.update(mailCampaigns).set({ status: 'sending', error: null, completedAt: null, actor: snapshot(actor) }).where(eq(mailCampaigns.id, id));
    return this.get(id, actor);
  }

  listSuppressions(actor: AuthContext) {
    return this.db.select({ id: mailSuppressions.id, email: mailSuppressions.email, reason: mailSuppressions.reason, createdAt: mailSuppressions.createdAt })
      .from(mailSuppressions).where(eq(mailSuppressions.tenantId, actor.tenantId)).orderBy(asc(mailSuppressions.email));
  }

  async addSuppression(input: MailSuppressionInput, actor: AuthContext) {
    return this.suppress(actor.tenantId, input.email, input.reason || null, actor.userId);
  }

  /**
   * Mailin altındaki bağlantıdan (veya RFC 8058 tek tık başlığından) gelen ret. Oturum yok; anahtar
   * alıcıya özel ve tahmin edilemez. Yanıt adresi maskeleyerek döner, başka bilgi sızdırmaz.
   */
  async unsubscribe(token: string) {
    const [row] = await this.db
      .select({ email: mailCampaignRecipients.email, tenantId: mailCampaigns.tenantId, subject: mailCampaigns.subject })
      .from(mailCampaignRecipients)
      .innerJoin(mailCampaigns, eq(mailCampaigns.id, mailCampaignRecipients.campaignId))
      .where(eq(mailCampaignRecipients.unsubscribeToken, token))
      .limit(1);
    if (!row) throw new NotFoundError('Bağlantı');
    await this.suppress(row.tenantId, row.email, `Bağlantıdan çıktı: ${row.subject}`.slice(0, 255), null);
    logger.info({ action: 'mail_unsubscribed', tenantId: row.tenantId }, '[mail] recipient unsubscribed');
    const [local, domain] = row.email.split('@');
    return { email: `${local.slice(0, 1)}***@${domain}` };
  }

  private async suppress(tenantId: string, rawEmail: string, reason: string | null, userId: string | null) {
    const email = rawEmail.toLocaleLowerCase('en-US');
    await this.db.insert(mailSuppressions)
      .values({ tenantId, email, reason, createdBy: userId })
      .onConflictDoNothing();
    // Süren gönderimlerde de bu adres atlansın.
    await this.db.update(mailCampaignRecipients).set({ status: 'skipped', error: 'Toplu mail almak istemiyor' })
      .where(and(
        eq(mailCampaignRecipients.email, email),
        eq(mailCampaignRecipients.status, 'pending'),
        sql`${mailCampaignRecipients.campaignId} in (select id from mail_campaigns where tenant_id = ${tenantId})`
      ));
    return { email };
  }

  async removeSuppression(id: string, actor: AuthContext) {
    // Ret kaydı yasal bir tercih; kaldırmak yöneticiye kalır.
    if (!isCampaignAdmin(actor)) throw new ForbiddenError('Ret listesinden yalnız yönetici kaldırabilir');
    const [row] = await this.db.delete(mailSuppressions)
      .where(and(eq(mailSuppressions.id, id), eq(mailSuppressions.tenantId, actor.tenantId))).returning({ id: mailSuppressions.id });
    if (!row) throw new NotFoundError('Kayıt');
    return { deleted: true };
  }

  /** Dış liste: başlıkta e-posta / ad / firma sütunları aranır; başlık yoksa satırdaki ilk e-posta alınır. */
  async parseList(input: MailRecipientListParseInput) {
    const { matrix } = await readSpreadsheetMatrix(input.fileName, input.fileBase64, {
      maxBytes: 2 * 1024 * 1024, maxUncompressedBytes: 20 * 1024 * 1024, maxRows: 5_000, maxColumns: 50,
    });
    const isEmailHeader = (h: string) => /^(e ?-?posta|e ?-?mail|email|mail|eposta)( adresi)?$/.test(h);
    const isNameHeader = (h: string) => /^(ad|adi|ad soyad|adi soyadi|isim|yetkili|kisi|ilgili kisi|name|full name)$/.test(h);
    const isCompanyHeader = (h: string) => /^(firma|firma adi|sirket|sirket adi|unvan|company)$/.test(h);
    const headerIndex = detectHeaderRow(matrix, (h) => isEmailHeader(h) || isNameHeader(h) || isCompanyHeader(h));
    const header = headerIndex >= 0 ? matrix[headerIndex].map(normalizeText) : [];
    const col = (test: (h: string) => boolean) => header.findIndex(test);
    const emailCol = col(isEmailHeader);
    const nameCol = col(isNameHeader);
    const companyCol = col(isCompanyHeader);

    const seen = new Set<string>();
    const rows: Array<{ email: string; name?: string; companyName?: string }> = [];
    let invalid = 0;
    for (const row of matrix.slice(headerIndex + 1)) {
      if (!row) continue;
      const raw = (emailCol >= 0 ? row[emailCol] : row.find((cell) => EMAIL_RE.test(cell?.trim() ?? '')))?.trim() ?? '';
      const email = raw.toLocaleLowerCase('en-US');
      if (!EMAIL_RE.test(email) || email.length > 255) { if (row.some((cell) => cell?.trim())) invalid++; continue; }
      if (seen.has(email)) continue;
      seen.add(email);
      rows.push({
        email,
        name: nameCol >= 0 ? row[nameCol]?.trim().slice(0, 255) || undefined : undefined,
        companyName: companyCol >= 0 ? row[companyCol]?.trim().slice(0, 255) || undefined : undefined,
      });
    }
    return { rows, invalid };
  }

  // ---- Arka plan gönderimi --------------------------------------------------

  @Interval(20_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      logger.error({ action: 'mail_campaign_tick_failed' }, String(error));
    } finally {
      this.running = false;
    }
  }

  async runOnce(now = new Date()): Promise<void> {
    await this.db.update(mailCampaignRecipients)
      .set({ status: 'failed', error: 'Gönderim yarıda kesildi; teslim edilip edilmediği bilinmiyor' })
      .where(and(eq(mailCampaignRecipients.status, 'sending'), lt(mailCampaignRecipients.claimedAt, new Date(now.getTime() - STALE_CLAIM_MS))));
    const active = await this.db.select().from(mailCampaigns).where(eq(mailCampaigns.status, 'sending')).orderBy(asc(mailCampaigns.createdAt));
    for (const campaign of active) await this.sendBatch(campaign, now);
  }

  /**
   * Sıradaki tek alıcıyı atomik UPDATE ile sahiplenir: iki API örneği aynı alıcıya göndermez,
   * çökmede yalnız denenen alıcı "belirsiz" kalır. Kampanya durdurulduysa hiçbir satır alınmaz.
   */
  private async claimNext(campaignId: string, now: Date) {
    const [row] = await this.db.update(mailCampaignRecipients)
      .set({ status: 'sending', claimedAt: now })
      .where(and(
        eq(mailCampaignRecipients.status, 'pending'),
        sql`${mailCampaignRecipients.id} in (
          select r.id from mail_campaign_recipients r join mail_campaigns c on c.id = r.campaign_id
          where r.campaign_id = ${campaignId} and r.status = 'pending' and c.status = 'sending'
          order by r.email limit 1
        )`
      ))
      .returning();
    return row as typeof row | undefined;
  }

  private async sendBatch(campaign: typeof mailCampaigns.$inferSelect, now: Date): Promise<void> {
    let recipient = await this.claimNext(campaign.id, now);
    if (!recipient) {
      const [{ open }] = await this.db.select({ open: count() }).from(mailCampaignRecipients)
        .where(and(eq(mailCampaignRecipients.campaignId, campaign.id), inArray(mailCampaignRecipients.status, ['pending', 'sending'])));
      if (!open) {
        await this.db.update(mailCampaigns).set({ status: 'completed', completedAt: now })
          .where(and(eq(mailCampaigns.id, campaign.id), eq(mailCampaigns.status, 'sending')));
      }
      return;
    }

    const snapshotActor = restore(campaign.actor);
    // Her turda güncel durum: kullanıcı pasifleştiyse ya da yetkisi alındıysa gönderim sürmez. İzinler
    // anlık görüntüyle bugünkü rol izinlerinin kesişimi — oluşturma anından geniş olamaz, sonradan daralır.
    const [owner] = await this.db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, campaign.createdBy), eq(users.tenantId, campaign.tenantId), eq(users.status, 'active'), isNull(users.deletedAt)));
    const current = owner ? await rolePermissionsCacheKey(this.db, campaign.createdBy) : new Set<string>();
    const actor: AuthContext = { ...snapshotActor, permissions: new Set([...snapshotActor.permissions].filter((code) => current.has(code))) };
    if (!owner || !actor.permissions.has('mail_campaigns.create')) {
      await this.stop(campaign.id, [recipient.id], 'Gönderenin hesabı pasif veya toplu mail yetkisi kaldırıldı; gönderim durduruldu');
      return;
    }
    let attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
    try {
      attachments = await Promise.all(campaign.fileIds.map(async (fileId) => {
        const file = await this.files.readForAttachment(fileId, actor);
        return { filename: file.filename, content: file.content, contentType: file.mimeType };
      }));
    } catch (error) {
      await this.stop(campaign.id, [recipient.id], 'Katalog eki okunamadı; dosya silinmiş olabilir');
      logger.warn({ action: 'mail_campaign_attachment_failed', campaignId: campaign.id }, String(error));
      return;
    }

    for (let sent = 1; recipient; recipient = sent++ < BATCH ? await this.claimNext(campaign.id, now) : undefined) {
      try {
        const delivery = await this.accounts.send({
          to: recipient.email,
          subject: fillPlaceholders(campaign.subject, recipient).replace(/[\r\n]+/g, ' ').slice(0, 255),
          text: fillPlaceholders(campaign.body, recipient),
          attachments: attachments.length ? attachments : undefined,
          unsubscribe: unsubscribeLinks(recipient.unsubscribeToken),
        }, actor);
        await this.db.update(mailCampaignRecipients).set({ status: 'sent', sentAt: delivery.sentAt, error: null })
          .where(eq(mailCampaignRecipients.id, recipient.id));
        if (recipient.companyId && actor.permissions.has('activities.create')) {
          await this.activities.createActivity({
            companyId: recipient.companyId,
            contactId: recipient.contactId ?? undefined,
            activityTypeCode: 'email',
            subject: `Toplu mail: ${campaign.subject}`.slice(0, 255),
            description: campaign.body.slice(0, 4000),
            activityDate: delivery.sentAt,
          }, actor).catch(() => undefined);
        }
      } catch (error) {
        // Kullanıcıya yalnız bizim ürettiğimiz (Türkçe, ham SMTP metni taşımayan) hatalar gösterilir.
        const message = error instanceof AppError ? error.message : 'Gönderilemedi';
        if (!(error instanceof AppError)) logger.warn({ action: 'mail_campaign_send_failed', campaignId: campaign.id }, String(error));
        await this.db.update(mailCampaignRecipients).set({ status: 'failed', error: message.slice(0, 255) })
          .where(eq(mailCampaignRecipients.id, recipient.id));
        // Hesap kapandıysa (şifre reddi vb.) kalanlar da düşecek; gönderimi durdur.
        if (!(await this.accounts.hasActiveAccount(actor).catch(() => false))) {
          await this.stop(campaign.id, [], 'Webmail hesabı yeniden bağlanmalı; gönderim durduruldu');
          return;
        }
      }
    }
  }

  /** Gönderimi durdurur; sahiplenilmiş ama gönderilmemiş alıcılar yeniden "bekliyor"a döner. Kullanıcının iptalini ezmez. */
  private async stop(campaignId: string, unsentIds: string[], reason: string) {
    if (unsentIds.length) {
      await this.db.update(mailCampaignRecipients).set({ status: 'pending', claimedAt: null })
        .where(inArray(mailCampaignRecipients.id, unsentIds));
    }
    await this.db.update(mailCampaigns).set({ status: 'failed', error: reason, completedAt: new Date() })
      .where(and(eq(mailCampaigns.id, campaignId), eq(mailCampaigns.status, 'sending')));
  }

  /** Kişisel SMTP kotası için kullanıcı başına tek süren gönderim (≈20 ileti/dk). */
  private async assertNoRunning(actor: AuthContext) {
    const [running] = await this.db.select({ id: mailCampaigns.id }).from(mailCampaigns)
      .where(and(eq(mailCampaigns.tenantId, actor.tenantId), eq(mailCampaigns.createdBy, actor.userId), eq(mailCampaigns.status, 'sending'))).limit(1);
    if (running) throw new ValidationError('Süren bir toplu gönderiminiz var; bitmesini bekleyin veya durdurun');
  }

  private async findVisible(id: string, actor: AuthContext) {
    const campaign = await this.db.query.mailCampaigns.findFirst({
      where: and(eq(mailCampaigns.id, id), eq(mailCampaigns.tenantId, actor.tenantId)),
    });
    if (!campaign || (!isCampaignAdmin(actor) && campaign.createdBy !== actor.userId)) throw new NotFoundError('Toplu mail');
    return campaign;
  }

  /** Toplu maile yalnız genel katalog kütüphanesindeki dosyalar eklenir. */
  private async assertCatalogFiles(fileIds: string[], actor: AuthContext) {
    if (!fileIds.length) return;
    if (!actor.roles.includes('super_admin') && !actor.permissions.has('products.read')) {
      throw new ForbiddenError('Katalog eklemek için ürün okuma yetkisi gerekli');
    }
    const rows = await this.db
      .selectDistinct({ id: files.id, sizeBytes: files.sizeBytes })
      .from(files)
      .innerJoin(fileLinks, and(eq(fileLinks.fileId, files.id), eq(fileLinks.entityType, 'catalog'), eq(fileLinks.entityId, actor.tenantId)))
      .where(and(inArray(files.id, fileIds), eq(files.tenantId, actor.tenantId), isNull(files.deletedAt)));
    if (rows.length !== fileIds.length) throw new NotFoundError('Katalog dosyası');
    if (rows.reduce((sum, row) => sum + row.sizeBytes, 0) > MAIL_MAX_ATTACHMENT_BYTES) {
      throw new ValidationError(`Eklerin toplam boyutu ${Math.round(MAIL_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB sınırını aşıyor`);
    }
  }

  /**
   * Firma/kontak bağlantıları gönderenin görebildiği kayıtlara ait olmalı. Bağlantı yalnız adres o
   * kontağın (ya da firmanın) kendi e-postasıysa korunur; görünmeyen kayıt (ör. fuar kaydının bağlı firması) veya
   * eşleşmeyen adreste bağlantı kaldırılır, gönderim engellenmez — bağlantı yalnız aktivite kaydı içindir.
   */
  private async verifiedCrmLinks(recipients: MailCampaignCreateInput['recipients'], actor: AuthContext) {
    if (recipients.some((r) => r.contactId && !r.companyId)) {
      throw new ValidationError('Kontak bağlantısı için firma bağlantısı da gereklidir');
    }
    const companyIds = [...new Set(recipients.flatMap((r) => (r.companyId ? [r.companyId] : [])))];
    if (!companyIds.length) return recipients;
    const visibility = await companyVisibilityFilter(this.db, actor);
    const visible = await this.db.select({ id: companies.id }).from(companies)
      .where(and(inArray(companies.id, companyIds), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt), visibility ?? sql`true`));
    const visibleIds = new Set(visible.map((row) => row.id));

    const lower = (value: string | null) => value?.trim().toLocaleLowerCase('en-US') ?? '';
    const known = new Set<string>(); // `${companyId}|${contactId ?? ''}|${email}`
    const contactRows = await this.db
      .select({ id: contacts.id, companyId: contacts.companyId, work: contacts.workEmail, personal: contacts.personalEmail, other: contacts.otherEmail })
      .from(contacts)
      .where(and(inArray(contacts.companyId, companyIds), eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)));
    for (const row of contactRows) for (const email of [row.work, row.personal, row.other]) if (email) known.add(`${row.companyId}|${row.id}|${lower(email)}`);
    const emailRows = await this.db.select({ companyId: companyEmails.companyId, email: companyEmails.email }).from(companyEmails)
      .where(and(inArray(companyEmails.companyId, companyIds), eq(companyEmails.tenantId, actor.tenantId), isNull(companyEmails.deletedAt)));
    for (const row of emailRows) known.add(`${row.companyId}||${lower(row.email)}`);

    return recipients.map((r) => (!r.companyId || (visibleIds.has(r.companyId) && known.has(`${r.companyId}|${r.contactId ?? ''}|${r.email}`))
      ? r
      : { ...r, companyId: undefined, contactId: undefined }));
  }
}
