import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import nodemailer, { type Transporter } from 'nodemailer';
import type { UserMailAccountStatus, UserMailAccountUpsertInput } from '@haksan/shared';
import { loadEnv } from '../../config/env';
import type { DbClient } from '../../db/client';
import { userMailAccounts } from '../../db/schema/mail';
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
    };
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

    const transporter = this.createTransport(account.email, password);
    let messageId: string | null = null;
    try {
      const info = await transporter.sendMail({
        from: { name: account.displayName, address: account.email },
        replyTo: account.email,
        to: input.to,
        cc: input.cc?.length ? input.cc : undefined,
        subject: input.subject,
        text: input.text,
        attachments: input.attachments,
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
