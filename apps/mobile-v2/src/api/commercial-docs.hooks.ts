import { useInfiniteQuery, useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { documentKeys } from './documents.hooks';
import { quoteKeys } from './crm.hooks';
import {
  accountingInvoiceCreateApi,
  commercialInvoiceApi,
  contractApi,
  fileLinksApi,
  proformaApi,
  type CommercialInvoiceInput,
  type ContractInput,
  type ProformaInput,
  type StandaloneContractInput,
  type StandaloneProformaInput,
} from './commercial-docs.api';

const LINK_PAGE_SIZE = 200;

export const fileLinkKeys = {
  all: ['files', 'links'] as const,
};

function invalidateDocuments(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: documentKeys.all });
  void qc.invalidateQueries({ queryKey: fileLinkKeys.all });
  void qc.invalidateQueries({ queryKey: quoteKeys.all });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

function useDocumentMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn, onSettled: () => invalidateDocuments(qc) });
}

/** Belge merkezinin dosya bağlantıları (dış teklif, muhasebe faturası, saha formları, diğer). */
export function useFileLinks(enabled = true) {
  return useInfiniteQuery({
    queryKey: fileLinkKeys.all,
    initialPageParam: 1,
    enabled,
    queryFn: ({ pageParam }) => fileLinksApi.list({ page: pageParam, pageSize: LINK_PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((page) => page.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

/** Resolve a document's file even when it lies beyond the first links page. */
export function useLinkedFile(fileId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...fileLinkKeys.all, 'file', fileId],
    enabled: enabled && Boolean(fileId),
    queryFn: async () => {
      for (let page = 1; page <= 10_000; page++) {
        const result = await fileLinksApi.list({ page, pageSize: LINK_PAGE_SIZE });
        if (result.meta.page !== page) throw new Error('Dosya bilgileri yüklenemedi.');
        const found = result.data.find(row => row.fileId === fileId);
        if (found) return found;
        if (page >= result.meta.totalPages) return null;
        if (!result.data.length) throw new Error('Dosya bilgileri yüklenemedi.');
      }
      throw new Error('Dosya bilgileri tamamlanamadı.');
    },
  });
}

export const useCreateProforma = () => useDocumentMutation((body: ProformaInput) => proformaApi.create(body));
export const useCreateStandaloneProforma = () =>
  useDocumentMutation((body: StandaloneProformaInput) => proformaApi.createStandalone(body));
export const useUpdateProforma = () =>
  useDocumentMutation(({ id, body }: { id: string; body: Partial<ProformaInput> }) => proformaApi.update(id, body));
export const useUpdateStandaloneProforma = () =>
  useDocumentMutation(({ id, body }: { id: string; body: StandaloneProformaInput }) => proformaApi.updateStandalone(id, body));
export const useDeleteProforma = () => useDocumentMutation((id: string) => proformaApi.remove(id));

export const useCreateContract = () => useDocumentMutation((body: ContractInput) => contractApi.create(body));
export const useCreateStandaloneContract = () =>
  useDocumentMutation((body: StandaloneContractInput) => contractApi.createStandalone(body));
export const useUpdateContract = () =>
  useDocumentMutation(({ id, body }: { id: string; body: Partial<ContractInput> }) => contractApi.update(id, body));
export const useUpdateStandaloneContract = () =>
  useDocumentMutation(({ id, body }: { id: string; body: StandaloneContractInput }) => contractApi.updateStandalone(id, body));
export const useDeleteContract = () => useDocumentMutation((id: string) => contractApi.remove(id));

export const useCreateCommercialInvoice = () =>
  useDocumentMutation((body: CommercialInvoiceInput) => commercialInvoiceApi.create(body));
export const useUpdateCommercialInvoice = () =>
  useDocumentMutation(({ id, body }: { id: string; body: Partial<CommercialInvoiceInput> }) => commercialInvoiceApi.update(id, body));
export const useDeleteCommercialInvoice = () => useDocumentMutation((id: string) => commercialInvoiceApi.remove(id));

/** Yüklenen dosyayı siler; sunucu yalnız yükleyene izin verir (files.delete). */
export const useDeleteFile = () => useDocumentMutation((fileId: string) => fileLinksApi.remove(fileId));

/** Satış siparişinden / tekliften muhasebe faturası (web `invoicePrefillFromOrder` akışı). */
export function useCreateAccountingInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountingInvoiceCreateApi.create,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['finance'] });
      void qc.invalidateQueries({ queryKey: ['sales-orders'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Yükleme sonrası (dosya + isteğe bağlı ticari kayıt) listeleri tazeler. */
export function useInvalidateDocuments() {
  const qc = useQueryClient();
  return () => invalidateDocuments(qc);
}
