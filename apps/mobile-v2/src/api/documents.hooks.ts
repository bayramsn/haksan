import { useInfiniteQuery, useQuery, type QueryKey } from '@tanstack/react-query';
import { commercialDocs, type CommercialDocumentDetail } from './endpoints';
import type { Paginated } from './client';

const PAGE_SIZE = 50;

export type DocumentKind = 'proforma' | 'contract' | 'invoice';
export type DocumentScope = { search?: string; companyId?: string; quoteId?: string };

export const documentKeys = {
  all: ['commercial-docs'] as const,
  list: (kind: DocumentKind, scope: DocumentScope): QueryKey => ['commercial-docs', kind, scope],
  detail: (kind: DocumentKind, id: string): QueryKey => ['commercial-docs', kind, 'detail', id],
};

/**
 * Üç belge türünün ortak satır şekli. Proforma `documentNo`/`issueDate`,
 * sözleşme `contractNo`/`signedDate`, fatura `invoiceNo`/`invoiceDate` taşıyor;
 * ekranın bunları ayrı ayrı bilmesi gerekmesin diye hook'ta tek şekle indiriliyor.
 */
export type DocumentRow = {
  id: string;
  no: string;
  date: string | null;
  companyName: string | null;
  companyId: string | null;
  statusName: string | null;
  finalized: boolean;
  /** Belgenin bağlı olduğu teklif; teklif detayındaki "Belgeler" sekmesi bununla süzer. */
  quoteId: string | null;
  quoteNo: string | null;
  opportunityId: string | null;
  statusCode: string | null;
  /** Yüklenmiş PDF; belge merkezinde aynı dosya ayrıca listelenmez. */
  fileId: string | null;
  /** Teklifsiz hızlı belge (anlık görüntüde `standalone: true`). */
  standalone: boolean;
  currencyCode: string | null;
  grandTotal: string | null;
  createdAt: string | null;
};

/** Sayfa zarfını türden bağımsız okumak için; alanlar zaten aynı. */
type Envelope = Paginated<Record<string, unknown>>;

function toRow(raw: Record<string, unknown>): DocumentRow {
  const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
  const company = raw.company as { id?: string; legalTitle?: string; shortName?: string | null } | null | undefined;
  const status = raw.status as { name?: string; code?: string } | null | undefined;
  const quote = raw.quote as { documentNo?: string; opportunityId?: string | null; grandTotal?: string | null } | null | undefined;
  const currency = raw.currency as { code?: string } | null | undefined;
  const snapshot = raw.documentSnapshot as Record<string, unknown> | null | undefined;
  const snapshotQuote = snapshot?.quote as { grandTotal?: unknown } | null | undefined;
  const snapshotTotal = snapshotQuote?.grandTotal;

  return {
    id: String(raw.id),
    no: str(raw.documentNo) ?? str(raw.contractNo) ?? str(raw.invoiceNo) ?? '—',
    date: str(raw.issueDate) ?? str(raw.signedDate) ?? str(raw.invoiceDate) ?? str(raw.createdAt),
    companyName: company?.shortName ?? company?.legalTitle ?? str(raw.companyNameText),
    companyId: company?.id ?? str(raw.companyId),
    statusName: status?.name ?? null,
    finalized: Boolean(raw.finalizedAt),
    quoteId: str(raw.quoteId),
    quoteNo: str(quote?.documentNo),
    opportunityId: str(quote?.opportunityId),
    statusCode: str(status?.code),
    fileId: str(raw.fileId),
    standalone: snapshot?.standalone === true,
    currencyCode: str(currency?.code),
    grandTotal:
      typeof snapshotTotal === 'string' || typeof snapshotTotal === 'number' ? String(snapshotTotal) : str(quote?.grandTotal),
    createdAt: str(raw.createdAt),
  };
}

async function fetchPage(kind: DocumentKind, page: number, scope: DocumentScope): Promise<Envelope> {
  const query = { page, pageSize: PAGE_SIZE, ...scope };
  if (kind === 'proforma') return commercialDocs.proformas(query) as unknown as Promise<Envelope>;
  if (kind === 'contract') return commercialDocs.contracts(query) as unknown as Promise<Envelope>;
  return commercialDocs.invoices(query) as unknown as Promise<Envelope>;
}

export function useCommercialDocuments(kind: DocumentKind, scope: DocumentScope = {}, enabled = true) {
  return useInfiniteQuery({
    queryKey: documentKeys.list(kind, scope),
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage(kind, pageParam, scope),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({
      items: data.pages.flatMap((p) => p.data.map(toRow)),
      total: data.pages[0]?.meta.total ?? 0,
    }),
  });
}

export function useCommercialDocument(kind: DocumentKind, id: string) {
  return useQuery<CommercialDocumentDetail>({
    queryKey: documentKeys.detail(kind, id),
    queryFn: async (): Promise<CommercialDocumentDetail> => {
      if (kind === 'proforma') return await commercialDocs.getProforma(id);
      if (kind === 'contract') return await commercialDocs.getContract(id);
      return await commercialDocs.getInvoice(id);
    },
    enabled: Boolean(id),
  });
}
