import * as Print from 'expo-print';
import { inlinePrintImages } from './inlinePrintImages';
import * as Sharing from 'expo-sharing';
import { apiBaseOrigin } from '../api/config';
import { companyService, contactService, lookupService, productService, quoteService, financeService } from '../api/services';
import { commercialDocumentHtml, type CommercialDocumentKind } from './commercialDocumentData';

/** Older records without a frozen snapshot load their actual related CRM data. */
async function legacySnapshot(record: Record<string, any>, kind: CommercialDocumentKind): Promise<Record<string, any>> {
  if (!record.quoteId) throw new Error('Belgenin kayıtlı içeriği veya ilişkili teklifi bulunamadı.');
  const quote = await quoteService.get(record.quoteId);
  const [company, contact, currencies, units] = await Promise.all([
    companyService.get(quote.companyId),
    quote.contactId ? contactService.get(quote.contactId) : Promise.resolve(null),
    lookupService.byName('currencies'),
    lookupService.byName('units'),
  ]);
  const receivables: any[] = [];
  if (kind === 'contract') {
    let page = 1;
    let totalPages = 1;
    do {
      const response = await financeService.receivables({ companyId: quote.companyId, page, pageSize: 100 });
      receivables.push(...response.data.filter((row: any) => row.quoteId === quote.id));
      totalPages = response.meta.totalPages;
      page += 1;
    } while (page <= totalPages);
  }
  const currency = currencies.find((item) => item.id === quote.currencyId);
  if (!currency) throw new Error('Teklifin para birimi bulunamadı.');
  const productIds = [...new Set<string>((quote.items ?? []).map((item: any) => item.productModelId).filter(Boolean))];
  const products = await Promise.all(productIds.map((id) => productService.get(id)));
  const addresses = [...(company.addresses ?? [])].sort((a, b) =>
    Number(b.id === quote.companyAddressId) - Number(a.id === quote.companyAddressId)
      || Number(Boolean(b.isBilling)) - Number(Boolean(a.isBilling))
      || Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)),
  );
  return {
    document: record, quote, company, contact, currency,
    companyAddresses: addresses, companyPhones: company.phones ?? [], companyEmails: company.emails ?? [],
    terms: quote.terms, receivables,
    items: (quote.items ?? []).map((item: any) => ({
      ...item,
      unitCode: units.find((unit) => unit.id === item.unitId)?.code,
      product: products.find((product) => product.id === item.productModelId),
    })),
  };
}

export async function shareCommercialDocument(kind: CommercialDocumentKind, record: any): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda PDF paylaşımı kullanılamıyor.');
  const snapshot = record.documentSnapshot ?? await legacySnapshot(record, kind);
  const html = await commercialDocumentHtml(kind, record, snapshot, apiBaseOrigin());
  const printableHtml = await inlinePrintImages(html);
  const result = await Print.printToFileAsync({ html: printableHtml, width: 595.28, height: 841.89 });
  // Keep the generated cache file available for recipients reading the share URI
  // asynchronously (especially Android content providers); the OS owns this cache.
  await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: kind === 'proforma' ? 'Proforma PDF' : 'Sözleşme PDF' });
}
