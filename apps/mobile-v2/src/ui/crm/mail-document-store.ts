import type { MailSendInput } from '@haksan/shared';

export type MailDocumentDraft = {
  label: string;
  companyId?: string;
  to?: string;
  subject?: string;
  payload: Pick<MailSendInput, 'productDocument' | 'document' | 'reportDocument'>;
};

export function createMailDocumentStore(scope: () => string, random: () => string, now: () => number = Date.now) {
  const entries = new Map<string, { scope: string; expires: number; value: MailDocumentDraft }>();
  function clean() {
    for (const [id, row] of entries) {
      if (row.scope !== scope() || row.expires <= now()) entries.delete(id);
    }
  }
  return {
    stage(value: MailDocumentDraft) {
      clean();
      const product = value.payload.productDocument;
      const document = value.payload.document;
      const report = value.payload.reportDocument;
      const pdf = product?.pdf ?? document?.pdf ?? report;
      const serverDocument = Boolean(document && !document.pdf
        && ['proforma', 'contract'].includes(document.kind)
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(document.id));
      if ([product, document, report].filter(Boolean).length !== 1 || (!serverDocument && (!pdf?.html || pdf.html.length > 8_000_000))) {
        throw new Error('E-posta belgesi geçersiz veya çok büyük.');
      }
      if (entries.size >= 5) entries.delete(entries.keys().next().value!);
      const id = random();
      entries.set(id, { scope: scope(), expires: now() + 30 * 60_000, value });
      return id;
    },
    read(id: string) {
      clean();
      return entries.get(id)?.value ?? null;
    },
    remove(id: string) { entries.delete(id); },
  };
}
