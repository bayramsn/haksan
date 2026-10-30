import { RequestScopeChangedError, requestContextKey } from './client';
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { companies, devices, productsApi, type ServiceTicket } from '@/src/api/endpoints';
import { companyKeys } from '@/src/api/companies.hooks';
import { stockApi } from '@/src/api/products.api';
import { uploadEntityAttachment, type LocalUpload } from '@/src/native/files';
import { infinite, serviceKeys } from '@/src/api/operations.hooks';
import {
  serviceApi,
  type ComplaintCreateBody,
  type CustomerDeviceCreateBody,
  type CustomerDeviceUpdateBody,
  type InstallationBody,
  type TicketCreateBody,
} from '@/src/api/service.api';

export const complaintLinkKeys = {
  list: (scope: { companyId?: string; customerDeviceId?: string }) => ['service', 'complaint-links', scope] as const,
};

function invalidateTickets(qc: QueryClient, id?: string) {
  return Promise.all([
    id ? qc.invalidateQueries({ queryKey: serviceKeys.ticket(id) }) : null,
    qc.invalidateQueries({ queryKey: ['service', 'tickets'] }),
  ]);
}

/* -------------------------------------------------------- servis kaydı ---- */

export function useCreateTicketWithMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TicketCreateBody) => serviceApi.createTicket(body),
    onSuccess: async () => {
      await Promise.all([invalidateTickets(qc), qc.invalidateQueries({ queryKey: ['inventory', 'customer-devices'] })]);
    },
  });
}

/**
 * Metadata yaması. Sunucu üst düzey anahtarları birleştirir; liste alanları
 * (noteHistory, operations...) bu yüzden tamamı gönderilir.
 */
export function useUpdateTicketMeta(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof serviceApi.updateTicket>[1]) => serviceApi.updateTicket(id, body),
    onMutate: async (body) => {
      if (!body.metadata) return;
      const requestContext = requestContextKey();
      await qc.cancelQueries({ queryKey: serviceKeys.ticket(id) });
      if (requestContext !== requestContextKey()) throw new RequestScopeChangedError();
      const previous = qc.getQueryData<ServiceTicket>(serviceKeys.ticket(id));
      if (previous) {
        qc.setQueryData<ServiceTicket>(serviceKeys.ticket(id), {
          ...previous,
          metadata: { ...(previous.metadata ?? {}), ...body.metadata },
        });
      }
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (_error instanceof RequestScopeChangedError) return;
      if (context?.previous) qc.setQueryData(serviceKeys.ticket(id), context.previous);
    },
    onSettled: () => invalidateTickets(qc, id),
  });
}

export function useSetTicketStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, statusCode, serviceStage }: { id: string; statusCode: string; serviceStage: string }) =>
      serviceApi.setTicketStage(id, { statusCode, serviceStage }),
    onSuccess: (_result, { id }) => invalidateTickets(qc, id),
  });
}

export function useConsumeServiceParts(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Parameters<typeof serviceApi.consumeServiceParts>[0], 'serviceTicketId'>) =>
      serviceApi.consumeServiceParts({ ...body, serviceTicketId: ticketId }),
    onSuccess: async () => {
      await Promise.all([invalidateTickets(qc, ticketId), qc.invalidateQueries({ queryKey: ['inventory'] })]);
    },
  });
}

/* ---------------------------------------------------------------- ekler ---- */

type AttachmentEntity = 'service_ticket' | 'service_complaint_intake';

export const attachmentKeys = {
  list: (entityType: AttachmentEntity, entityId: string) => ['service', 'attachments', entityType, entityId] as const,
};

export function useServiceAttachments(entityType: AttachmentEntity, entityId: string) {
  return useQuery({
    queryKey: attachmentKeys.list(entityType, entityId),
    queryFn: () => serviceApi.attachments(entityType, entityId),
    select: (page) => page.data,
    enabled: Boolean(entityId),
  });
}

/** Web ServiceUploadButton / şikayet kanıtı ile aynı kova ve belge türü. */
export function useUploadServiceAttachment(entityType: AttachmentEntity, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (local: LocalUpload) =>
      uploadEntityAttachment({
        bucket: 'erp-service-documents',
        entityType,
        entityId,
        documentTypeCode: entityType === 'service_ticket' ? 'service_document' : 'service_complaint_evidence',
        local,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: attachmentKeys.list(entityType, entityId) }),
        entityType === 'service_complaint_intake' ? qc.invalidateQueries({ queryKey: serviceKeys.complaint(entityId) }) : null,
      ]);
    },
  });
}

/* ---------------------------------------------------------- şikayetler ---- */

export function useCreateComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ComplaintCreateBody) => serviceApi.createComplaint(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['service', 'complaints'] }),
  });
}

export function useComplaintLinks(scope: { companyId?: string; customerDeviceId?: string } = {}, enabled = true) {
  return useInfiniteQuery({
    ...infinite(complaintLinkKeys.list(scope), (page, pageSize) => serviceApi.complaintLinks({ page, pageSize, ...scope })),
    enabled,
  });
}

export function useComplaintLinkMutations() {
  const qc = useQueryClient();
  const settle = () => qc.invalidateQueries({ queryKey: ['service', 'complaint-links'] });
  return {
    create: useMutation({ mutationFn: serviceApi.createComplaintLink, onSuccess: settle }),
    rotate: useMutation({ mutationFn: serviceApi.rotateComplaintLink, onSuccess: settle }),
    revoke: useMutation({ mutationFn: serviceApi.revokeComplaintLink, onSuccess: settle }),
  };
}

/* ------------------------------------------------------- bakım planı ---- */

export function useDeleteMaintenancePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => serviceApi.deleteMaintenancePlan(id),
    onSuccess: (_result, id) => {
      qc.removeQueries({ queryKey: serviceKeys.maintenancePlan(id) });
      void qc.invalidateQueries({ queryKey: ['service', 'maintenance'] });
    },
  });
}

/* ------------------------------------------------------------ kurulum ---- */

function invalidateInstallations(qc: QueryClient, id?: string) {
  return Promise.all([
    id ? qc.invalidateQueries({ queryKey: serviceKeys.installation(id) }) : null,
    qc.invalidateQueries({ queryKey: ['service', 'installations'] }),
  ]);
}

export function useCreateInstallation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InstallationBody) => serviceApi.createInstallation(body),
    onSuccess: () => invalidateInstallations(qc),
  });
}

export function useUpdateInstallation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InstallationBody) => serviceApi.updateInstallation(id, body),
    onSuccess: () => invalidateInstallations(qc, id),
  });
}

export function useDeleteInstallation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => serviceApi.deleteInstallation(id),
    onSuccess: (_result, id) => {
      qc.removeQueries({ queryKey: serviceKeys.installation(id) });
      void qc.invalidateQueries({ queryKey: ['service', 'installations'] });
    },
  });
}

/* ------------------------------------------------------------- makine ---- */

export function useCreateCustomerDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomerDeviceCreateBody) => serviceApi.createCustomerDevice(body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inventory', 'customer-devices'] }),
        qc.invalidateQueries({ queryKey: ['inventory', 'list'] }),
      ]);
    },
  });
}

/** Listede yalnız kullanıcı firmadan farklı "İlk Müşteri" adlarını çözer (firma detay önbelleği paylaşılır). */
export function useCompanyNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: companyKeys.detail(id),
      queryFn: () => companies.get(id),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const names = new Map<string, string>();
  results.forEach((result, index) => {
    const company = result.data;
    if (company) names.set(unique[index]!, company.shortName ?? company.legalTitle);
  });
  return names;
}

/** Garanti şeridi için sunucu toplamları: tümü / garantide / bitmiş (yalnız sayfa meta'sı). */
export function useDeviceWarrantyTotals(search?: string) {
  const presets = [undefined, 'warranty', 'expired'] as const;
  const results = useQueries({
    queries: presets.map((preset) => ({
      queryKey: ['inventory', 'customer-devices', 'count', search ?? '', preset ?? 'all'],
      queryFn: () => devices.list({ page: 1, pageSize: 1, search, preset }),
      select: (page: Awaited<ReturnType<typeof devices.list>>) => page.meta.total,
      staleTime: 60 * 1000,
    })),
  });
  const [all, warranty, expired] = results.map((result) => result.data);
  if (all === undefined || warranty === undefined || expired === undefined) return null;
  return { all, warranty, expired, unknown: Math.max(0, all - warranty - expired) };
}

/** Firmaya ayrılan stoklar: sabit ilk 200 yerine aramalı, sayfalı kaynak. */
export function useReservedMachineStock(companyId: string | null, search?: string) {
  return useInfiniteQuery({
    ...infinite(['inventory', 'reserved-machines', companyId, search], (page, pageSize) => stockApi.listPage({ page, pageSize, search, categoryCode: 'TEZGAH' })),
    select: (data) => ({ items: data.pages.flatMap((page) => page.data).filter((item) => item.reservedCompanyId === companyId && item.status?.code !== 'inactive'), total: data.pages[0]?.meta.total ?? 0 }),
    enabled: Boolean(companyId),
    retry: false,
  });
}

/** Kullanıcı firma + ilgili kişi; ilk müşteri (initialCompanyId) sunucuda korunur. */
export function useUpdateCustomerDevice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomerDeviceUpdateBody) => serviceApi.updateCustomerDevice(id, body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: serviceKeys.device(id) }),
        qc.invalidateQueries({ queryKey: ['inventory', 'customer-devices'] }),
      ]);
    },
  });
}

/* ------------------------------------------------- servis fiyat listesi ---- */

export function useSavePriceListPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      listId: string;
      itemId?: string;
      productModelId: string;
      prices: { cashPrice?: number; listPrice?: number };
    }) =>
      input.itemId
        ? productsApi.updatePriceListItem(input.listId, input.itemId, input.prices)
        : serviceApi.createPriceListItem(input.listId, { productModelId: input.productModelId, ...input.prices }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['price-lists'] }),
  });
}
