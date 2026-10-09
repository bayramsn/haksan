import { Inject, Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import nodemailer, { type Transporter } from 'nodemailer';
import { esc, type UserMailAccountStatus, type UserMailAccountUpsertInput, type UserMailSignatureInput } from '@haksan/shared';
import { loadEnv } from '../../config/env';
import type { DbClient } from '../../db/client';
import { userTitles } from '../../db/schema/lookup';
import { userMailAccounts } from '../../db/schema/mail';
import { tenants } from '../../db/schema/tenants';
import { users } from '../../db/schema/users';
import { DB } from '../database/database.module';
import { AuditService } from '../database/audit.service';
import type { AuthContext } from '../security/auth.types';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { decryptCredential, encryptCredential } from './credential-crypto';

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type PersonalMailDelivery = {
  messageId: string | null;
  sentAt: Date;
  fromEmail: string;
  fromName: string;
};

const SIGNATURE_LOGO_CID = 'haksan-signature-logo';
const SIGNATURE_LOGO_CANDIDATES = [
  path.resolve(process.cwd(), 'apps/web/public/print/haksan-mini.png'),
  path.resolve(process.cwd(), '../web/public/print/haksan-mini.png'),
  path.resolve(__dirname, '../../../../web/public/print/haksan-mini.png'),
];
let signatureLogo: Buffer | null | undefined;
/** İmza logosu bulunamazsa null: imza yine gider, yalnız logosuz. */
const signatureLogoContent = (): Buffer | null => {
  if (signatureLogo === undefined) {
    const file = SIGNATURE_LOGO_CANDIDATES.find((candidate) => existsSync(candidate));
    signatureLogo = file ? readFileSync(file) : null;
  }
  return signatureLogo;
};

/**
 * Mesajın düz metin ve HTML hâlleri. İmza düz metinde standart "-- " ayracıyla,
 * HTML'de logolu blok olarak eklenir; kullanıcı metni her iki hâlde de kaçışlanır.
 */
export const signedMailBody = (body: string, signature: string, withLogo: boolean): { text: string; html: string } => {
  const htmlLines = (value: string) => esc(value).replace(/\r?\n/g, '<br>');
  const signatureLines = signature.split('\n');
  const signatureHtml = signature
    ? `<div style="margin-top:18px;padding-top:10px;border-top:1px solid #dddddd;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#333333">`
      + (withLogo ? `<img src="cid:${SIGNATURE_LOGO_CID}" width="143" height="56" alt="HAKSAN" style="display:block;margin-bottom:6px;border:0">` : '')
      + `<strong>${esc(signatureLines[0])}</strong>`
      + (signatureLines.length > 1 ? `<br>${htmlLines(signatureLines.slice(1).join('\n'))}` : '')
      + `</div>`
    : '';
  return {
    text: signature ? `${body}\n\n-- \n${signature}` : body,
    // pre-wrap: düz metindeki girinti ve art arda boşluklar HTML'de de korunur.
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222;white-space:pre-wrap">${esc(body)}</div>${signatureHtml}`,
  };
};

@Injectable()
export class UserMailAccountService {
  private readonly env = loadEnv();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  async status(actor: Pick<AuthContext, 'tenantId' | 'userId'>): Promise<UserMailAccountStatus> {
    const account = await this.find(actor);
    return {
      featureEnabled: this.env.USER_MAIL_ENABLED,
      configured: Boolean(account),
      email: account?.email ?? null,
      displayName: account?.displayName ?? null,
      status: account ? (account.status === 'error' ? 'error' : 'active') : null,
      serverLabel: this.serverLabel(),
      lastVerifiedAt: account?.lastVerifiedAt?.toISOString() ?? null,
      lastUsedAt: account?.lastUsedAt?.toISOString() ?? null,
      signature: account?.signature ?? null,
      defaultSignature: await this.defaultSignature(actor, account?.email),
    };
  }

  async updateSignature(input: UserMailSignatureInput, actor: AuthContext): Promise<UserMailAccountStatus> {
    this.assertFeatureEnabled();
    if (!(await this.find(actor))) throw new ValidationError('Önce Ayarlar > Webmail bölümünden posta hesabınızı bağlayın');
    const signature = input.signature === null ? null : input.signature.replace(/\r\n?/g, '\n').trim();
    await this.db
      .update(userMailAccounts)
      .set({ signature, updatedAt: new Date() })
      .where(and(eq(userMailAccounts.tenantId, actor.tenantId), eq(userMailAccounts.userId, actor.userId)));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'user_mail_account.signature_updated',
      resourceType: 'user_mail_account',
      resourceId: actor.userId,
      newValues: { signature: signature === null ? 'default' : signature ? 'custom' : 'none' },
    });
    return this.status(actor);
  }

  async hasActiveAccount(actor: Pick<AuthContext, 'tenantId' | 'userId'>): Promise<boolean> {
    if (!this.env.USER_MAIL_ENABLED) return false;
    const account = await this.find(actor);
    return account?.status === 'active';
  }

  async configure(input: UserMailAccountUpsertInput, actor: AuthContext): Promise<UserMailAccountStatus> {
    this.assertFeatureEnabled();
    const email = input.email.trim().toLowerCase();
    this.assertAllowedDomain(email);
    await this.verifyCredentials(email, input.password);

    const now = new Date();
    const encryptedPassword = encryptCredential(input.password, this.encryptionKey(), this.aad(actor));
    await this.db
      .insert(userMailAccounts)
      .values({
        tenantId: actor.tenantId,
        userId: actor.userId,
        email,
        displayName: input.displayName.trim(),
        encryptedPassword,
        status: 'active',
        lastVerifiedAt: now,
        lastErrorAt: null,
        lastErrorCode: null,
      })
      .onConflictDoUpdate({
        target: [userMailAccounts.tenantId, userMailAccounts.userId],
        set: {
          email,
          displayName: input.displayName.trim(),
          encryptedPassword,
          status: 'active',
          lastVerifiedAt: now,
          lastErrorAt: null,
          lastErrorCode: null,
          updatedAt: now,
        },
      });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'user_mail_account.connected',
      resourceType: 'user_mail_account',
      resourceId: actor.userId,
      newValues: { email, displayName: input.displayName.trim(), status: 'active' },
    });
    return this.status(actor);
  }

  async remove(actor: AuthContext): Promise<{ ok: true }> {
    await this.db
      .delete(userMailAccounts)
      .where(and(eq(userMailAccounts.tenantId, actor.tenantId), eq(userMailAccounts.userId, actor.userId)));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'user_mail_account.disconnected',
      resourceType: 'user_mail_account',
      resourceId: actor.userId,
    });
    return { ok: true };
  }

  async send(
    input: { to: string; cc?: string[]; subject: string; text: string; attachments?: MailAttachment[] },
    actor: Pick<AuthContext, 'tenantId' | 'userId'>
  ): Promise<PersonalMailDelivery> {
    this.assertFeatureEnabled();
    const account = await this.find(actor);
    if (!account || account.status !== 'active') {
      throw new ValidationError('Önce Ayarlar > Webmail bölümünden posta hesabınızı bağlayın');
    }

    let password: string;
    try {
      password = decryptCredential(account.encryptedPassword, this.encryptionKey(), this.aad(actor));
    } catch {
      await this.markError(actor, 'CREDENTIAL_DECRYPT_FAILED').catch(() => undefined);
      throw new ValidationError('Webmail hesabı yeniden bağlanmalı');
    }

    const signature = account.signature ?? (await this.defaultSignature(actor, account.email));
    const logo = signature ? signatureLogoContent() : null;
    const message = signedMailBody(input.text, signature, Boolean(logo));
    const attachments = [
      ...(input.attachments ?? []),
      ...(logo ? [{ filename: 'haksan-logo.png', content: logo, contentType: 'image/png', cid: SIGNATURE_LOGO_CID, contentDisposition: 'inline' as const }] : []),
    ];

    const transporter = this.createTransport(account.email, password);
    let messageId: string | null = null;
    try {
      const info = await transporter.sendMail({
        from: { name: account.displayName, address: account.email },
        replyTo: account.email,
        to: input.to,
        cc: input.cc?.length ? input.cc : undefined,
        subject: input.subject,
        text: message.text,
        html: message.html,
        attachments: attachments.length ? attachments : undefined,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      messageId = typeof info.messageId === 'string' ? info.messageId.slice(0, 255) : null;
    } catch (error) {
      const code = this.smtpErrorCode(error);
      await this.markError(actor, code).catch(() => undefined);
      logger.warn({ action: 'personal_mail_failed', userId: actor.userId, code }, '[mailer] personal webmail delivery failed');
      throw new ValidationError(
        code === 'AUTH_FAILED'
          ? 'Webmail şifresi kabul edilmedi; hesabı yeniden bağlayın'
          : 'Webmail sunucusuna ulaşılamadı; daha sonra tekrar deneyin'
      );
    } finally {
      transporter.close();
    }

    // SMTP kabulünden sonraki yerel durum yazımı başarısız olsa bile istemciye
    // "gönderilemedi" dönme; aksi halde kullanıcının tekrarı çift mail üretir.
    const sentAt = new Date();
    await this.db
      .update(userMailAccounts)
      .set({ lastUsedAt: sentAt, lastErrorAt: null, lastErrorCode: null, updatedAt: sentAt })
      .where(and(eq(userMailAccounts.tenantId, actor.tenantId), eq(userMailAccounts.userId, actor.userId)))
      .catch((error) => logger.warn({ error, action: 'personal_mail_usage_update_failed', userId: actor.userId }, '[mailer] delivery state update failed'));
    logger.info({ action: 'personal_mail_sent', userId: actor.userId, attachmentCount: input.attachments?.length ?? 0 }, '[mailer] personal webmail delivered');
    return { messageId, sentAt, fromEmail: account.email, fromName: account.displayName };
  }

  private async verifyCredentials(email: string, password: string): Promise<void> {
    const transporter = this.createTransport(email, password);
    try {
      await transporter.verify();
    } catch (error) {
      const code = this.smtpErrorCode(error);
      logger.warn({ action: 'personal_mail_verify_failed', code }, '[mailer] personal webmail verification failed');
      throw new ValidationError(
        code === 'AUTH_FAILED'
          ? 'E-posta adresi veya webmail şifresi kabul edilmedi'
          : 'Webmail sunucusuna güvenli bağlantı kurulamadı'
      );
    } finally {
      transporter.close();
    }
  }

  private createTransport(email: string, password: string): Transporter {
    return nodemailer.createTransport({
      host: this.env.USER_MAIL_SMTP_HOST!,
      port: this.env.USER_MAIL_SMTP_PORT,
      secure: this.env.USER_MAIL_SMTP_SECURE,
      requireTLS: !this.env.USER_MAIL_SMTP_SECURE,
      auth: { user: email, pass: password },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  /** Profilden imza: ad, ünvan, firma, telefonlar ve gönderen adres. */
  private async defaultSignature(actor: Pick<AuthContext, 'tenantId' | 'userId'>, accountEmail?: string | null): Promise<string> {
    const [row] = await this.db
      .select({
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        title: userTitles.name,
        company: tenants.name,
        companyPhone: tenants.phone,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .leftJoin(userTitles, eq(userTitles.id, users.titleId))
      .where(and(eq(users.id, actor.userId), eq(users.tenantId, actor.tenantId)))
      .limit(1);
    if (!row) return '';
    return [
      row.fullName,
      row.title,
      row.company,
      row.phone ? `Mobil: ${row.phone}` : null,
      row.companyPhone ? `Tel: ${row.companyPhone}` : null,
      accountEmail ?? row.email,
    ]
      .map((line) => line?.trim())
      .filter(Boolean)
      .join('\n');
  }

  private async find(actor: Pick<AuthContext, 'tenantId' | 'userId'>) {
    return this.db.query.userMailAccounts.findFirst({
      where: and(eq(userMailAccounts.tenantId, actor.tenantId), eq(userMailAccounts.userId, actor.userId)),
    });
  }

  private async markError(actor: Pick<AuthContext, 'tenantId' | 'userId'>, code: string): Promise<void> {
    const now = new Date();
    const disableAccount = code === 'AUTH_FAILED' || code === 'CREDENTIAL_DECRYPT_FAILED';
    await this.db
      .update(userMailAccounts)
      .set({ ...(disableAccount ? { status: 'error' } : {}), lastErrorAt: now, lastErrorCode: code.slice(0, 64), updatedAt: now })
      .where(and(eq(userMailAccounts.tenantId, actor.tenantId), eq(userMailAccounts.userId, actor.userId)));
  }

  private assertFeatureEnabled(): void {
    if (!this.env.USER_MAIL_ENABLED) {
      throw new ValidationError('Kişisel webmail bağlantısı sunucuda henüz etkinleştirilmemiş');
    }
  }

  private assertAllowedDomain(email: string): void {
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
    const allowed = (this.env.USER_MAIL_ALLOWED_EMAIL_DOMAINS ?? '')
      .split(',')
      .map((item) => item.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
    if (!allowed.includes(domain)) {
      throw new ValidationError('Yalnızca şirketin izin verdiği kurumsal e-posta adresleri bağlanabilir');
    }
  }

  private smtpErrorCode(error: unknown): string {
    const value = error as { code?: unknown; responseCode?: unknown };
    if (value?.code === 'EAUTH' || value?.responseCode === 535) return 'AUTH_FAILED';
    if (value?.code === 'ETIMEDOUT' || value?.code === 'ESOCKET') return 'CONNECTION_FAILED';
    if (value?.code === 'ECONNECTION' || value?.code === 'ECONNREFUSED') return 'CONNECTION_FAILED';
    return 'SMTP_FAILED';
  }

  private encryptionKey(): string {
    const key = this.env.USER_MAIL_CREDENTIAL_ENCRYPTION_KEY;
    if (!key) throw new ValidationError('Webmail kimlik bilgisi şifreleme anahtarı yapılandırılmamış');
    return key;
  }

  private aad(actor: Pick<AuthContext, 'tenantId' | 'userId'>): string {
    return `${actor.tenantId}:${actor.userId}`;
  }

  private serverLabel(): string | null {
    if (!this.env.USER_MAIL_ENABLED || !this.env.USER_MAIL_SMTP_HOST) return null;
    const security = this.env.USER_MAIL_SMTP_SECURE ? 'SSL/TLS' : 'STARTTLS';
    return `${this.env.USER_MAIL_SMTP_HOST}:${this.env.USER_MAIL_SMTP_PORT} · ${security}`;
  }
}
