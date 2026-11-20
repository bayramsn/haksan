import { printDocumentHtml } from '@haksan/shared';
import { quoteDoc, proformaDoc, contractDoc } from '@haksan/shared/dist/commercial-print/print/templates';
import { buildQuotePrintData } from '@haksan/shared/dist/commercial-print/print/quoteData';
import { proformaFromSnapshot } from '@haksan/shared/dist/commercial-print/print/proformaSnapshot';
import { buildContractData, contractReadinessErrors } from '@haksan/shared/dist/commercial-print/print/contractData';
import type { CommercialPdfKind } from '@haksan/shared';
import { ValidationError } from '../../shared/utils/errors';

/** Same pure layout functions as web; all business data is supplied by the API snapshot. */
export async function renderCommercialHtml(kind: CommercialPdfKind, record: Record<string, any>, snapshot: Record<string, any>, headerLogoMode: 'haksan' | 'company' | 'none' = 'haksan'): Promise<string> {
  const number = String(record.documentNo ?? record.contractNo);
  // Contract and quote layouts resolve machine names from this list, not from the line items.
  const products = (snapshot.items ?? []).filter((i: any) => i.product).map((i: any) => ({ ...i.product, id: i.productModelId, model: i.product.modelCode, brand: i.product.brandName, shortDescription: i.product.fullName, specs: i.compatibility?.technicalSpecs ?? [] }));
  if (kind === 'proforma') return printDocumentHtml(proformaDoc(proformaFromSnapshot({ fileName: number, uploadedAt: String(record.issueDate) }, snapshot, []), '/print'));
  if (kind === 'contract') {
    const data = await buildContractData({ customer: null, salesCase: null, products, payments: [], contractDate: String(record.signedDate ?? record.createdAt), contractNo: number, documentSnapshot: snapshot });
    const missing = contractReadinessErrors(data);
    if (missing.length) throw new ValidationError(`Sözleşme tamamlanmadan PDF hazırlanamaz: ${missing.join(', ')}.`);
    return printDocumentHtml(contractDoc(data, '/print'));
  }
  const company = snapshot.company ?? {};
  const contact = snapshot.contact ?? {};
  const phones = snapshot.companyPhones ?? [];
  const quote = { ...record, ...snapshot.quote, items: snapshot.items, terms: snapshot.terms, projectOwner: snapshot.projectOwner, documentSnapshot: snapshot };
  const data = buildQuotePrintData({
    offer: { id: record.id, currency: snapshot.currency?.code ?? 'TRY', date: String(quote.quoteDate), quoteNo: number, vatTotal: Number(quote.vatAmount), note: quote.notes ?? '' },
    customer: { logoUrl: company.logoFileId ? `/companies/media/${company.logoFileId}` : undefined, name: company.legalTitle ?? company.shortName ?? '', contactPerson: contact.fullName ?? '', phone: phones[0]?.phone ?? company.phone ?? '', email: snapshot.companyEmails?.[0]?.email ?? '', address: '', city: '', district: '', country: '', addresses: [] },
    headerLogoMode, salesCase: null, users: [], contacts: contact.id ? [{ id: contact.id, name: contact.fullName ?? '', phone: contact.workPhone ?? '', mobilePhone: contact.mobilePhone ?? '', email: contact.workEmail ?? '' }] : [], products,
  }, quote);
  return printDocumentHtml(quoteDoc(data, '/print'));
}
