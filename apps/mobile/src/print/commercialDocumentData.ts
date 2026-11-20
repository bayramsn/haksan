import { printMediaUrl } from './printMediaUrl';
import { printDocumentHtml } from '@haksan/shared';
import { proformaDoc, contractDoc } from '../../../web/src/app/lib/print/templates';
import { proformaFromSnapshot } from '../../../web/src/app/lib/print/proformaSnapshot';
import { buildContractData, assertContractReady } from '../../../web/src/app/lib/print/contractData';

export type CommercialDocumentKind = 'proforma' | 'contract';

/** Both platforms render the same CRM snapshot through the same HTML templates. */
export async function commercialDocumentHtml(
  kind: CommercialDocumentKind,
  record: Record<string, any>,
  snapshot: Record<string, any>,
  origin: string,
): Promise<string> {
  const assetBase = `${origin}/print`;
  const number = String((kind === 'contract' ? record.contractNo : record.documentNo) ?? '').trim();
  if (!number) throw new Error('Belge numarası bulunamadı.');
  const date = record.issueDate ?? record.signedDate ?? record.createdAt ?? snapshot.capturedAt;
  if (!date) throw new Error('Belge tarihi bulunamadı.');
  if (!Array.isArray(snapshot.items) || !snapshot.items.length) throw new Error('Belgenin kalem bilgileri bulunamadı.');
  if (!snapshot.currency?.code) throw new Error('Belgenin para birimi bulunamadı.');
  const resolveMediaUrl = (url: string) => printMediaUrl(url, origin);
  if (kind === 'proforma') {
    return printDocumentHtml(proformaDoc(proformaFromSnapshot({ fileName: number, uploadedAt: String(date) }, snapshot, [], undefined, resolveMediaUrl), assetBase));
  }
  const data = await buildContractData({
    customer: null, salesCase: null, products: [], payments: [],
    contractDate: String(date), contractNo: number, documentSnapshot: snapshot, resolveMediaUrl,
  });
  assertContractReady(data);
  return printDocumentHtml(contractDoc(data, assetBase));
}
