import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { opportunityKeys, quoteKeys } from './crm.hooks';
import { quotes, type QuoteListQuery } from './endpoints';
import { collectPaginated } from './pagination';
import {
  quoteOpportunityApi,
  quotesApi,
  type QuoteCreateInput,
  type QuoteDetailWithNote,
  type QuoteTermsInput,
  type QuoteUpdateInput,
} from './quotes.api';
import {
  buildOfferTrend,
  itemsNetTotal,
  lastMonths,
  mergeQuotePages,
  planQuoteItemChanges,
  type BusinessLine,
  type ParsedQuoteItem,
} from '@/src/ui/documents/quote-logic';

const GROUP_PAGE_SIZE = 50;

/** Complete scoped rows for decisions and aggregates; partial pages must not decide CRM state. */
export function useAllQuoteList(query: QuoteListQuery, enabled = true) {
  return useQuery({
    queryKey: ['quotes', 'complete', query],
    enabled,
    queryFn: () => collectPaginated((page) => quotes.list({ ...query, page, pageSize: GROUP_PAGE_SIZE })),
    select: (result) => ({ items: result.data, total: result.meta.total }),
  });
}


function invalidateQuoteFlows(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: quoteKeys.all });
  void qc.invalidateQueries({ queryKey: opportunityKeys.all });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

/** Web KPI kartları: toplam + taslak/gönderilen/onaylı/reddedilmiş adetleri (yalnız `meta.total`). */
export function useQuoteStatusCounts(businessLine?: BusinessLine) {
  const codes = ['', 'draft', 'sent', 'approved', 'rejected'] as const;
  const results = useQueries({
    queries: codes.map((code) => {
      const query: QuoteListQuery = { ...(businessLine ? { businessLine } : {}), ...(code ? { statusCode: code } : {}) };
      return {
        queryKey: ['quotes', 'count', query],
        queryFn: () => quotesApi.count(query),
        select: (data: Awaited<ReturnType<typeof quotesApi.count>>) => data.meta.total,
      };
    }),
  });
  const [total, draft, sent, approved, rejected] = results.map((result) => result.data ?? 0);
  return {
    total: total ?? 0,
    draft: draft ?? 0,
    sent: sent ?? 0,
    approved: approved ?? 0,
    rejected: rejected ?? 0,
    isPending: results.some((result) => result.isPending),
    error: results.find((result) => result.error)?.error ?? null,
    refetch: () => Promise.all(results.map((result) => result.refetch())),
  };
}

/** Son 6 ayın gönderilen/onaylanan trendi (web "Teklif Trendi"). */
export function useQuoteTrend(businessLine?: BusinessLine) {
  const now = new Date();
  const buckets = lastMonths(now, 6);
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
  // Gün sonu: anahtar gün içinde sabit kalır, bugünkü teklifler de dahil olur.
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const statusCodes = ['sent', 'approved', 'rejected'] as const;
  const results = useQueries({
    queries: statusCodes.map((statusCode) => {
      const query: QuoteListQuery = { statusCode, from, to, ...(businessLine ? { businessLine } : {}) };
      return { queryKey: quoteKeys.summary(query), queryFn: () => quotes.summary(query) };
    }),
  });
  return {
    buckets,
    points: buildOfferTrend(buckets, {
      sent: results[0]?.data,
      approved: results[1]?.data,
      rejected: results[2]?.data,
    }),
    isPending: results.some((result) => result.isPending),
  };
}

/**
 * Birden çok durum kodunu birleştiren sekme (Takip, Red / İptal). Liste ucu
 * tek `statusCode` alıyor; her kod aynı sayfa numarasıyla paralel istenir ve
 * sonuç birleştirilir. Herhangi bir kodun devamı varsa sonraki sayfa açılır.
 */
export function useGroupedQuoteList(query: QuoteListQuery, statusCodes: string[], enabled = true) {
  return useInfiniteQuery({
    queryKey: ['quotes', 'group', query, statusCodes],
    initialPageParam: 1,
    enabled: enabled && statusCodes.length > 1,
    queryFn: async ({ pageParam }) => {
      const pages = await Promise.all(
        statusCodes.map((statusCode) => quotesApi.page({ ...query, statusCode, page: pageParam, pageSize: GROUP_PAGE_SIZE }))
      );
      return {
        page: pageParam,
        rows: pages.flatMap((page) => page.data),
        total: pages.reduce((sum, page) => sum + page.meta.total, 0),
        hasMore: pages.some((page) => page.meta.page < page.meta.totalPages),
      };
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    select: (data) => ({
      items: mergeQuotePages(data.pages.map((page) => page.rows)),
      total: data.pages[0]?.total ?? 0,
    }),
  });
}

/** Kayıp satış kartları — "En sık ret nedeni" bunlardan sayılır (web `cases.filter(isLost)`). */
export function useLostOpportunitiesForQuotes() {
  return useQuery({
    queryKey: ['opportunities', 'lost-for-quotes'],
    queryFn: () => collectPaginated((page) => quoteOpportunityApi.lost({ page, pageSize: 200 })),
    select: (data) => data.data,
    staleTime: 5 * 60 * 1000,
  });
}

/** Detay: `statusNote` ve `divisionId` dahil ham satır. */
export function useQuoteDetail(id: string) {
  return useQuery({
    queryKey: quoteKeys.detail(id),
    queryFn: () => quotes.get(id) as Promise<QuoteDetailWithNote>,
    enabled: Boolean(id),
  });
}

export type QuoteSaveInput = {
  quote: QuoteCreateInput;
  items: ParsedQuoteItem[];
  terms: QuoteTermsInput;
};

/**
 * Web `store.createQuoteFull`: fırsat seçilmediyse önce satış kartı açılır
 * (başlık = ilk kalem, tahmini tutar = net kalem toplamı, olasılık %50), teklif
 * oluşturulur, kalemler sırayla eklenir, şartlar yazılır, yeni kart "Teklif"
 * aşamasına alınır.
 */
export function useCreateQuoteFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quote, items, terms }: QuoteSaveInput) => {
      let opportunityId = quote.opportunityId;
      let createdNewCase = false;
      if (!opportunityId) {
        const opportunity = await quoteOpportunityApi.create({
          companyId: quote.companyId,
          title: items[0]?.description.slice(0, 255) || 'Yeni Teklif',
          estimatedValue: itemsNetTotal(items),
          currencyCode: quote.currencyCode,
          probability: 50,
          ...(quote.divisionId ? { divisionId: quote.divisionId } : {}),
        });
        opportunityId = opportunity.id;
        createdNewCase = true;
      }
      const created = await quotesApi.create({ ...quote, opportunityId });
      for (const item of items) {
        const { itemId: _ignored, ...body } = item;
        await quotesApi.addItem(created.id, body);
      }
      await quotesApi.terms(created.id, terms);
      if (createdNewCase) {
        await quoteOpportunityApi.changeStage(opportunityId, { toStage: 'quote' }).catch(() => undefined);
      }
      return created;
    },
    onSettled: () => invalidateQuoteFlows(qc),
  });
}

/** Web QuoteDialog düzenleme: başlık PATCH + şartlar PUT + `persistQuoteItems`. */
export function useUpdateQuoteFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quote, items, terms }: { id: string; quote: QuoteUpdateInput; items: ParsedQuoteItem[]; terms: QuoteTermsInput }) => {
      await quotesApi.update(id, quote);
      await quotesApi.terms(id, terms);
      const existing = await quotes.get(id);
      const plan = planQuoteItemChanges(
        existing.items.map((item) => item.id),
        items
      );
      for (const entry of plan.update) await quotesApi.updateItem(id, entry.itemId, entry.body);
      for (const body of plan.add) await quotesApi.addItem(id, body);
      for (const itemId of plan.remove) await quotesApi.deleteItem(id, itemId);
      return id;
    },
    onSettled: () => invalidateQuoteFlows(qc),
  });
}

/** Tek kalem silme (detaydaki kalem satırından). */
export function useDeleteQuoteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) => quotesApi.deleteItem(id, itemId),
    onSettled: () => invalidateQuoteFlows(qc),
  });
}

/** Süper admin fiyat onayı / reddi (web `quoteService.approvePrice/rejectPrice`). */
export function useQuotePriceDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'reject'; note?: string }) =>
      decision === 'approve' ? quotesApi.approvePrice(id, note) : quotesApi.rejectPrice(id, note),
    onSuccess: (updated) => {
      if (updated?.id) qc.setQueryData(quoteKeys.detail(updated.id), updated);
    },
    onSettled: () => invalidateQuoteFlows(qc),
  });
}

/** Kayıp kartı "Satışa Al" (web `moveCase(id, 'sales')`). */
export function useMoveOpportunityToSales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opportunityId: string) => quoteOpportunityApi.changeStage(opportunityId, { toStage: 'sales' }),
    onSettled: () => invalidateQuoteFlows(qc),
  });
}
