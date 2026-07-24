import { Injectable } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import { logger } from '../utils/logger';

/**
 * WhatsApp Business (Meta Cloud API) giden mesaj servisi — env ile bayrağa bağlı.
 * Yapılandırılmamışsa tüm gönderimler sessizce `false` döner (uygulama çalışır).
 * API anahtarı yalnız sunucuda; istemciye asla sızmaz.
 */
@Injectable()
export class WhatsAppService {
  private readonly env = loadEnv();

  isConfigured(): boolean {
    return Boolean(
      this.env.WHATSAPP_ENABLED &&
        this.env.WHATSAPP_PHONE_NUMBER_ID &&
        this.env.WHATSAPP_ACCESS_TOKEN,
    );
  }

  private endpoint(): string {
    return `https://graph.facebook.com/${this.env.WHATSAPP_API_VERSION}/${this.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  }

  private normalizeTo(to: string): string {
    // Meta E.164'ü artı işaretsiz bekler (ör. 905321234567).
    return to.replace(/[^\d]/g, '');
  }

  private async post(payload: Record<string, unknown>): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.warn({ action: 'whatsapp_send_failed', status: res.status }, text.slice(0, 300));
        return false;
      }
      logger.info({ action: 'whatsapp_sent', type: payload.type }, '[whatsapp] message delivered');
      return true;
    } catch (error) {
      logger.warn({ action: 'whatsapp_send_error' }, String(error));
      return false;
    }
  }

  /** Düz metin mesaj gönder. Yapılandırılmamışsa false. */
  async sendText(to: string, body: string): Promise<boolean> {
    return this.post({
      messaging_product: 'whatsapp',
      to: this.normalizeTo(to),
      type: 'text',
      text: { preview_url: false, body: body.slice(0, 4000) },
    });
  }

  /** Belge (ör. teklif PDF) gönder — herkese açık erişilebilir URL gerekir. */
  async sendDocument(to: string, link: string, filename: string, caption?: string): Promise<boolean> {
    return this.post({
      messaging_product: 'whatsapp',
      to: this.normalizeTo(to),
      type: 'document',
      document: { link, filename, ...(caption ? { caption: caption.slice(0, 1000) } : {}) },
    });
  }
}
