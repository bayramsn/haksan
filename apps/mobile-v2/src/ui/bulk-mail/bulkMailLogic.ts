/** Web BulkMailPage kuralları; saf mantık (node:test doğrudan içe aktarır). */
import { MAIL_CAMPAIGN_MAX_RECIPIENTS, type MailCampaignCreateInput } from '@haksan/shared';
import type { Tone } from '../../theme/theme';

export type RecipientSource = 'CRM' | 'Liste';
export type Recipient = {
  email: string;
  name?: string;
  companyName?: string;
  companyId?: string;
  contactId?: string;
  source: RecipientSource;
};

export const DEFAULT_CAMPAIGN_BODY = 'Merhaba {{ad}},\n\n\n\nSaygılarımızla';
/** Web: webmail hesabından dakikada ~20 ileti. */
export const SEND_RATE_PER_MINUTE = 20;
export const LIST_FILE_MAX_BYTES = 2 * 1024 * 1024;

const STATUS: Record<string, { label: string; tone: Tone }> = {
  sending: { label: 'Gönderiliyor', tone: 'info' },
  completed: { label: 'Tamamlandı', tone: 'success' },
  cancelled: { label: 'Durduruldu', tone: 'neutral' },
  failed: { label: 'Hata', tone: 'destructive' },
  pending: { label: 'Bekliyor', tone: 'neutral' },
  sent: { label: 'Gönderildi', tone: 'success' },
  skipped: { label: 'Atlandı', tone: 'warning' },
};

export function statusMeta(status: string): { label: string; tone: Tone } {
  return STATUS[status] ?? { label: status, tone: 'neutral' };
}

export const recipientKey = (email: string) => email.trim().toLocaleLowerCase('en-US');

/** Web `add`: küçük harfe indirip tekilleştirir, 300 sınırını aşanları sayar. */
export function addRecipients(
  current: readonly Recipient[],
  rows: readonly Recipient[],
  max = MAIL_CAMPAIGN_MAX_RECIPIENTS,
): { list: Recipient[]; added: number; skipped: number } {
  const list = [...current];
  const seen = new Set(list.map((row) => row.email));
  let skipped = 0;
  let added = 0;
  for (const row of rows) {
    const email = recipientKey(row.email);
    if (!email || seen.has(email)) continue;
    if (list.length >= max) {
      skipped++;
      continue;
    }
    seen.add(email);
    list.push({ ...row, email });
    added++;
  }
  return { list, added, skipped };
}

export function capWarning(skipped: number, max = MAIL_CAMPAIGN_MAX_RECIPIENTS): string | null {
  return skipped ? `${max} alıcı sınırı: ${skipped} adres eklenmedi` : null;
}

/** Liste satırı: "12/40 · 2 hata · 1 atlandı". */
export function progressText(row: { sent: number; total: number; failed: number; skipped: number }): string {
  return [`${row.sent}/${row.total}`, row.failed ? `${row.failed} hata` : null, row.skipped ? `${row.skipped} atlandı` : null]
    .filter(Boolean)
    .join(' · ');
}

export function countByStatus(recipients: readonly { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of recipients) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}

/** Web CampaignDialog düğmeleri: gönderimde "durdur", değilse kalan bekleyene "sürdür". */
export function campaignActions(status: string, counts: Record<string, number>, canSend: boolean) {
  const pending = counts.pending ?? 0;
  return {
    canCancel: canSend && status === 'sending',
    resumeCount: canSend && status !== 'sending' && pending > 0 ? pending : 0,
  };
}

export const estimatedMinutes = (count: number) => Math.max(1, Math.ceil(count / SEND_RATE_PER_MINUTE));

export function composeProblem(draft: { ready: boolean; recipients: number; subject: string; body: string }): string | null {
  if (!draft.ready) return 'Gönderici hesabı hazır değil. Ayarlar > Webmail bölümünden kurumsal adresinizi bağlayın.';
  if (!draft.recipients) return 'En az bir alıcı seçin';
  if (!draft.subject.trim()) return 'Konu zorunludur';
  if (!draft.body.trim()) return 'Mesaj zorunludur';
  return null;
}

/** Web `submit` gövdesi: kaynak etiketi atılır, kontak yalnız firmayla birlikte gider. */
export function toCreatePayload(input: {
  subject: string;
  body: string;
  fileIds: string[];
  recipients: readonly Recipient[];
}): MailCampaignCreateInput {
  return {
    subject: input.subject.trim(),
    body: input.body.trim(),
    fileIds: input.fileIds.length ? input.fileIds : undefined,
    recipients: input.recipients.map((row) => ({
      email: row.email,
      name: row.name?.trim().slice(0, 255) || undefined,
      companyName: row.companyName?.trim().slice(0, 255) || undefined,
      companyId: row.companyId,
      contactId: row.companyId ? row.contactId : undefined,
    })),
  };
}

export function listFileProblem(file: { name: string; size: number | null }): string | null {
  if (!/\.(xlsx|csv)$/i.test(file.name) || (file.size ?? 0) > LIST_FILE_MAX_BYTES) return "Liste .xlsx veya .csv olmalı ve 2 MB'ı aşmamalı";
  return null;
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * Yapıştırılan metni parse-list'in okuduğu CSV'ye çevirir: her satır bir alıcı,
 * hücreler virgül / noktalı virgül / sekme ya da "Ad <adres>" ile ayrılır.
 * Başlık satırı (E-posta, Ad Soyad, Firma) varsa sunucu sütunları ondan sezer.
 */
export function pastedListToCsv(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/[,;\t<>]/).map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => cells.length > 0)
    .map((cells) => cells.map(csvCell).join(','))
    .join('\n');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * UTF-8 → base64; Hermes'te Buffer yok, btoa yalnız Latin-1 kabul eder.
 * Baytlar encodeURIComponent'ten çıkarılır (her JS motorunda var); eşsiz vekil karakterde URIError atar.
 */
export function utf8ToBase64(text: string): string {
  const encoded = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(encoded.charCodeAt(i));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (b === undefined ? '=' : B64[(n >> 6) & 63]!) + (c === undefined ? '=' : B64[n & 63]!);
  }
  return out;
}

export function parseResultMessage(result: { rows: unknown[]; invalid: number }): string {
  return result.invalid
    ? `${result.rows.length} adres okundu · ${result.invalid} satırda geçerli e-posta yok, atlandı.`
    : `${result.rows.length} adres okundu`;
}
