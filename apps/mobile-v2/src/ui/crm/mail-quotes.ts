import { MAIL_MAX_QUOTES } from '@haksan/shared';

export type MailQuote = { id: string; companyId: string; documentNo: string; revisionNo: number };

/** Firması değişen taslağın eski teklifleri gönderime taşınmaz. */
export function scopedMailQuotes(companyId: string | undefined, rows: MailQuote[]): MailQuote[] {
  return companyId ? rows.filter((row, index) => row.companyId === companyId && rows.findIndex((item) => item.id === row.id) === index) : [];
}

export function addMailQuote(rows: MailQuote[], quote: MailQuote, companyId: string | undefined): { rows: MailQuote[]; error: string | null } {
  const current = scopedMailQuotes(companyId, rows);
  if (!companyId || quote.companyId !== companyId) return { rows: current, error: 'Teklif seçili firmaya ait değil.' };
  if (current.some((row) => row.id === quote.id)) return { rows: current, error: null };
  if (current.length >= MAIL_MAX_QUOTES) return { rows: current, error: `Bir e-postaya en fazla ${MAIL_MAX_QUOTES} teklif eklenebilir.` };
  return { rows: [...current, quote], error: null };
}
