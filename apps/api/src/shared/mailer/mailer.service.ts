import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { loadEnv } from '../../config/env';
import type { AuthContext } from '../security/auth.types';
import { logger } from '../utils/logger';
import { UserMailAccountService, type MailAttachment } from './user-mail-account.service';

@Injectable()
export class MailerService {
  private readonly env = loadEnv();
  private transporter: Transporter | null = null;

  constructor(private readonly userMailAccounts: UserMailAccountService) {}

  private getTransporter(): Transporter | null {
    if (
      this.env.NODE_ENV === 'test' ||
      (this.env.NODE_ENV === 'production' &&
        (!this.env.SMTP_USER || !this.env.SMTP_PASSWORD || /^(localhost|127\.0\.0\.1)$/i.test(this.env.SMTP_HOST)))
    ) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.env.SMTP_HOST,
        port: this.env.SMTP_PORT,
        secure: this.env.SMTP_SECURE,
        ...(this.env.SMTP_USER && this.env.SMTP_PASSWORD
          ? { auth: { user: this.env.SMTP_USER, pass: this.env.SMTP_PASSWORD } }
          : {}),
      });
    }
    return this.transporter;
  }

  isConfigured(): boolean {
    return this.getTransporter() !== null;
  }

  async canSendFor(actor: Pick<AuthContext, 'tenantId' | 'userId'>): Promise<boolean> {
    const personal = await this.userMailAccounts.status(actor);
    if (personal.configured) return personal.featureEnabled && personal.status === 'active';
    return this.isConfigured();
  }

  async sendTextEmail(input: {
    to: string;
    subject: string;
    text: string;
    attachments?: MailAttachment[];
    actor?: Pick<AuthContext, 'tenantId' | 'userId'>;
  }): Promise<boolean> {
    if (input.actor) {
      const personal = await this.userMailAccounts.status(input.actor);
      if (personal.configured) {
        await this.userMailAccounts.send(input, input.actor);
        return true;
      }
    }
    const transporter = this.getTransporter();
    if (!transporter) return false;
    await transporter.sendMail({
      from: this.env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments,
    });
    logger.info(
      { action: 'assistant_mail_sent', attachmentCount: input.attachments?.length ?? 0 },
      '[mailer] assistant mail delivered'
    );
    return true;
  }

  async sendPasswordReset(to: string, token: string): Promise<boolean> {
    const transporter = this.getTransporter();
    if (!transporter || !this.env.APP_PUBLIC_URL) return false;
    const resetUrl = new URL(this.env.APP_PUBLIC_URL);
    resetUrl.searchParams.set('resetToken', token);
    await transporter.sendMail({
      from: this.env.SMTP_FROM,
      to,
      subject: 'Haksan parola sıfırlama',
      text: `Parolanızı sıfırlamak için bu bağlantıyı açın: ${resetUrl.toString()}\n\nBu bağlantı ${this.env.RESET_TOKEN_TTL_MINUTES} dakika geçerlidir.`,
    });
    logger.info({ action: 'password_reset_mail_sent' }, '[mailer] password reset delivered');
    return true;
  }
}
