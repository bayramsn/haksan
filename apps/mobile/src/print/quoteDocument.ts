import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { companyService, contactService, lookupService, productService, quoteService } from '../api/services';
import { apiBaseOrigin } from '../api/config';
import { inlinePrintImages } from './inlinePrintImages';
import { productForPrint } from './productTechnicalDocumentData';
import { quoteDocumentHtml, quoteRecordForPrint } from './quoteDocumentData';

export async function shareQuoteDocument(quoteId: string): Promise<void> {
  if (!quoteId) throw new Error('Teklif seçilmedi.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda PDF paylaşımı kullanılamıyor.');
  const raw = await quoteService.get(quoteId);
  const quote = quoteRecordForPrint(raw);
  const origin = apiBaseOrigin();
  const snapshot = raw.documentSnapshot;
  const frozen = Boolean(raw.finalizedAt || snapshot?.document?.finalizedAt);
  const savedCurrency = frozen ? snapshot?.currency?.code : undefined;
  const [company, contact, currencies] = await Promise.all([
    frozen && snapshot?.company ? Promise.resolve({ ...snapshot.company, addresses: snapshot.companyAddresses ?? [], phones: snapshot.companyPhones ?? [], emails: snapshot.companyEmails ?? [] }) : companyService.get(quote.companyId),
    frozen && snapshot?.contact ? Promise.resolve(snapshot.contact) : quote.contactId ? contactService.get(quote.contactId) : Promise.resolve(null),
    savedCurrency ? Promise.resolve([snapshot.currency]) : lookupService.byName('currencies'),
  ]);
  const currency = savedCurrency ?? currencies.find((row) => row.id === quote.currencyId)?.code;
  const productIds = [...new Set<string>((quote.items ?? []).map((item: any) => item.productModelId).filter(Boolean))];
  const products = frozen ? productIds.map((id) => {
    const item = quote.items.find((row: any) => row.productModelId === id);
    const saved = item.product ?? {};
    return productForPrint({
      ...saved, id, fullName: saved.fullName ?? saved.full_name ?? item.description,
      modelCode: saved.modelCode ?? saved.model_code, modelName: saved.modelName ?? saved.model_name,
      brand: { name: saved.brandName ?? saved.brand_name ?? saved.brand },
      currency: { code: currency }, specs: item.compatibility?.technicalSpecs ?? [],
    }, [], origin);
  }) : await Promise.all(productIds.map(async (id) => productForPrint(await productService.get(id), [], origin)));
  const html = await inlinePrintImages(quoteDocumentHtml(raw, company, contact, currency, products, origin));
  const file = await Print.printToFileAsync({ html, width: 595.28, height: 841.89 });
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Teklif PDF' });
}
