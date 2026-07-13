import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { loadEnv } from '../../config/env';
import { logger } from '../utils/logger';

@Injectable()
export class MailerService {
  private readonly env = loadEnv();
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter | null {
    if (
      !this.env.APP_PUBLIC_URL ||
      !this.env.SMTP_USER ||
      !this.env.SMTP_PASSWORD ||
      /^(localhost|127\.0\.0\.1)$/i.test(this.env.SMTP_HOST)
    ) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.env.SMTP_HOST,
        port: this.env.SMTP_PORT,
        secure: this.env.SMTP_SECURE,
        auth: { user: this.env.SMTP_USER, pass: this.env.SMTP_PASSWORD },
      });
    }
    return this.transporter;
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
