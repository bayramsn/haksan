import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuoteDraftCreateInput, QuoteDraftUpdateInput, ProformaCreateInput, ProformaUpdateInput, ContractCreateInput, ContractUpdateInput, StandaloneProformaCreateInput, StandaloneContractCreateInput, StandaloneProformaUpdateInput, StandaloneContractUpdateInput } from '@haksan/shared';
import { request } from '@/src/api/client';
import type { QuoteDetail, ProformaDetail, ContractDetail } from '@/src/api/endpoints';

export type DraftKind = 'quote' | 'proforma' | 'contract';
export const paths: Record<DraftKind, string> = { quote: 'quotes', proforma: 'proformas', contract: 'contracts' };
export type PdfStatus = { status: 'missing' | 'ready' | 'outdated'; fileId: string | null; documentRevision: string | null; generatedAt: string | null };
export const commercialApi = {
  createQuote: (body: QuoteDraftCreateInput) => request<QuoteDetail>('/quotes/draft', { method: 'POST', body }),
  updateQuote: (id: string, body: QuoteDraftUpdateInput) => request<QuoteDetail>(`/quotes/${id}/draft`, { method: 'PATCH', body }),
  createProforma: (body: ProformaCreateInput) => request<ProformaDetail>('/proformas', { method: 'POST', body }),
  updateProforma: (id: string, body: ProformaUpdateInput) => request<ProformaDetail>(`/proformas/${id}`, { method: 'PATCH', body }),
  createContract: (body: ContractCreateInput) => request<ContractDetail>('/contracts', { method: 'POST', body }),
  updateContract: (id: string, body: ContractUpdateInput) => request<ContractDetail>(`/contracts/${id}`, { method: 'PATCH', body }),
  saveStandalone: (kind: 'proforma' | 'contract', body: StandaloneProformaCreateInput | StandaloneContractCreateInput | StandaloneProformaUpdateInput | StandaloneContractUpdateInput, id?: string) => request<{ id: string }>(`/${paths[kind]}/standalone${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body }),
  pdfStatus: (kind: DraftKind, id: string) => request<PdfStatus>(`/${paths[kind]}/${id}/pdf/status`),
};
export function usePdfStatus(kind: DraftKind, id: string, enabled = true) {
  return useQuery({ queryKey: ['commercial-pdf', kind, id], queryFn: () => commercialApi.pdfStatus(kind, id), enabled: enabled && Boolean(id), staleTime: 0 });
}
export function useSaveCommercialDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (save: () => Promise<{ id: string }>) => save(),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['quotes'] }),
        qc.invalidateQueries({ queryKey: ['commercial-docs'] }),
        qc.invalidateQueries({ queryKey: ['commercial-pdf'] }),
      ]);
    },
  });
}
