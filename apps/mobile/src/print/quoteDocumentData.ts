import { printDocumentHtml } from '@haksan/shared';
import { buildQuotePrintData } from '../../../web/src/app/lib/print/quoteData';
import { quoteDoc } from '../../../web/src/app/lib/print/templates';
import { snapshotAddressLine } from '../../../web/src/app/lib/print/core';
import type { Product } from '../../../web/src/app/lib/mock';
import { printMediaUrl } from './printMediaUrl';

/** Frozen quotes keep the recorded price/terms; catalog prices never enter this flow. */
export function quoteRecordForPrint(raw: Record<string, any>): Record<string, any> {
  const snapshot = raw.documentSnapshot;
  if ((raw.finalizedAt || snapshot?.document?.finalizedAt) && snapshot?.quote && Array.isArray(snapshot.items)) {
    return { ...raw, ...snapshot.quote, items: snapshot.items, terms: snapshot.terms ?? raw.terms, documentSnapshot: snapshot };
  }
  return raw;
}

export function quoteDocumentHtml(raw: Record<string, any>, company: Record<string, any>, contact: Record<string, any> | null, currency: string, products: Product[], origin: string): string {
  const quote = quoteRecordForPrint(raw);
  if (!quote.documentNo || !quote.quoteDate) throw new Error('Teklif numarası veya tarihi bulunamadı.');
  if (!['USD', 'EUR', 'TRY'].includes(currency)) throw new Error('Teklifin para birimi bulunamadı.');
  if (!company?.legalTitle && !company?.shortName) throw new Error('Teklifin firma bilgileri bulunamadı.');
  if (!Array.isArray(quote.items) || !quote.items.length) throw new Error('Teklif kalemleri bulunamadı.');
  for (const item of quote.items) {
    if (!String(item.description ?? '').trim() || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0
      || item.unitPrice == null || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) {
      throw new Error('Teklif kalemlerinin açıklama, miktar veya fiyat bilgileri eksik.');
    }
  }
  const addresses = company.addresses ?? [];
  const address = addresses.find((row: any) => row.id === quote.companyAddressId)
    ?? addresses.find((row: any) => row.isBilling) ?? addresses.find((row: any) => row.isDefault) ?? addresses[0];
  const phone = (company.phones ?? []).find((row: any) => row.phoneType === 'main')
    ?? (company.phones ?? []).find((row: any) => row.isDefault && row.phoneType !== 'fax')
    ?? (company.phones ?? []).find((row: any) => row.phoneType !== 'fax');
  const email = (company.emails ?? []).find((row: any) => row.emailType === 'main')
    ?? (company.emails ?? []).find((row: any) => row.isDefault) ?? company.emails?.[0];
  const data = buildQuotePrintData({
    offer: { id: quote.id, quoteNo: quote.documentNo, date: quote.quoteDate, currency: currency as 'USD' | 'EUR' | 'TRY', vatTotal: Number(quote.vatAmount ?? 0), note: quote.notes ?? '' },
    customer: {
      name: company.legalTitle || company.shortName, contactPerson: contact?.fullName ?? '',
      phone: phone?.phone ?? '', phone2: company.phones?.find((row: any) => row.phoneType === 'secondary')?.phone,
      fax: company.phones?.find((row: any) => row.phoneType === 'fax')?.phone,
      email: email?.email ?? '', city: '', address: address ? snapshotAddressLine(address) : '', logoUrl: printMediaUrl(company.logoUrl, origin),
    },
    salesCase: null, users: [], products,
    contacts: contact ? [{ id: contact.id ?? quote.contactId, name: contact.fullName ?? '', phone: contact.workPhone ?? '', mobilePhone: contact.mobilePhone ?? '', email: contact.workEmail ?? contact.email ?? '' }] : [],
    resolveMediaUrl: (url) => printMediaUrl(url, origin),
  }, quote);
  return printDocumentHtml(quoteDoc(data, `${origin}/print`));
}
