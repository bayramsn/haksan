/** Web ComposeMailDialog kuralları; saf mantık. */

export const MAIL_BODY_MAX_LENGTH = 10_000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export type MailAccountLike = {
  featureEnabled: boolean;
  configured: boolean;
  status: string | null;
  signature: string | null;
  defaultSignature: string;
};

export function isMailAccountReady(account: MailAccountLike | null | undefined): boolean {
  return Boolean(account?.featureEnabled && account.configured && account.status === 'active');
}

/** Sunucunun eklediği imza: kayıtlı imza, yoksa profilden varsayılan ('' = imzasız). */
export function mailSignature(account: MailAccountLike | null | undefined): string {
  return account ? account.signature ?? account.defaultSignature : '';
}

export function initialMailBody(name?: string | null): string {
  return name?.trim() ? `Merhaba ${name.trim()},\n\n` : 'Merhaba,\n\n';
}

/** Gönderim öncesi doğrulama; hata metni web toast'ları ile aynı. */
export function validateMailDraft(draft: { to: string; subject: string; body: string }): string | null {
  if (!draft.to.trim() || !draft.subject.trim() || !draft.body.trim()) return 'Alıcı, konu ve mesaj zorunludur';
  if (!isValidEmail(draft.to)) return 'Geçerli bir e-posta adresi girin';
  if (draft.body.length > MAIL_BODY_MAX_LENGTH) return 'Mesaj en fazla 10.000 karakter olabilir';
  return null;
}

/** CC listesine elle adres ekleme; geçersizse hata, tekrarsa listeyi değiştirmez. */
export function addCcAddress(list: string[], raw: string): { list: string[]; error: string | null } {
  const email = raw.trim();
  if (!email) return { list, error: null };
  if (!isValidEmail(email)) return { list, error: 'Geçerli bir e-posta adresi girin' };
  return { list: list.includes(email) ? list : [...list, email], error: null };
}

export type MailComposeParams = {
  to?: string | null;
  name?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  subject?: string | null;
};

/** `/modal/mail-compose` rotası; boş alanlar sorguya yazılmaz. */
export function mailComposeHref(params: MailComposeParams): string {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return query ? `/modal/mail-compose?${query}` : '/modal/mail-compose';
}
