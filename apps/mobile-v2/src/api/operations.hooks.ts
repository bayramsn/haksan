import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { ServiceComplaintRejectInput, ServiceComplaintUpdateInput } from '@haksan/shared';
import type { Tone } from '@/src/theme/theme';
import { chat, devices, service, type ServiceTicket, type ServiceTicketListQuery, type Shipment, type WarrantyClaim, type WarrantyPartInput } from './endpoints';

/** Lookup'larda kullandığımızla aynı desen: nadiren değişen referans veri, uzun süre taze sayılır. */
const REFERENCE_STALE_TIME = 60 * 60 * 1000;

const PAGE_SIZE = 50;

/** Sayfalı listeyi sonsuz kaydırmaya çeviren ortak sarmalayıcı. */
function infinite<T>(key: QueryKey, fetchPage: (page: number, pageSize: number) => Promise<{ data: T[]; meta: { page: number; totalPages: number; total: number } }>) {
  return {
    queryKey: key,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) => fetchPage(pageParam, PAGE_SIZE),
    getNextPageParam: (last: { meta: { page: number; totalPages: number } }) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    select: (data: { pages: { data: T[]; meta: { total: number } }[] }) => ({
      items: data.pages.flatMap((p) => p.data),
      total: data.pages[0]?.meta.total ?? 0,
    }),
  };
}

/* ------------------------------------------------------- servis talebi ---- */

export const serviceKeys = {
  tickets: (query: ServiceTicketListQuery = {}): QueryKey => ['service', 'tickets', query],
  ticketSummary: (query: Omit<ServiceTicketListQuery, 'sortDir'> = {}): QueryKey =>
    ['service', 'tickets', 'summary', query],
  ticket: (id: string): QueryKey => ['service', 'ticket', id],
  warranty: (ticketId: string): QueryKey => ['service', 'warranty', ticketId],
  complaints: (scope: { search?: string; status?: string }): QueryKey => ['service', 'complaints', scope],
  complaint: (id: string): QueryKey => ['service', 'complaint', id],
  installations: (scope: { search?: string; phase?: 'planned' | 'ongoing' | 'done' }): QueryKey =>
    ['service', 'installations', scope],
  installation: (id: string): QueryKey => ['service', 'installation', id],
  shipments: (phase?: 'active' | 'arrived'): QueryKey => ['service', 'shipments', phase ?? 'all'],
  shipment: (id: string): QueryKey => ['service', 'shipment', id],
  maintenance: (scope: { dueSoon?: boolean }): QueryKey => ['service', 'maintenance', scope],
  maintenancePlan: (id: string): QueryKey => ['service', 'maintenance', 'detail', id],
  devices: (query: { companyId?: string; search?: string; preset?: 'warranty' | 'expired' } = {}): QueryKey =>
    ['inventory', 'customer-devices', query],
  device: (id: string): QueryKey => ['inventory', 'customer-devices', 'detail', id],
};

export function useServiceTickets(query: ServiceTicketListQuery = {}) {
  return useInfiniteQuery(
    infinite(serviceKeys.tickets(query), (page, pageSize) => service.tickets({ ...query, page, pageSize }))
  );
}

export function useServiceTicketSummary(query: Omit<ServiceTicketListQuery, 'sortDir'> = {}) {
  return useQuery({
    queryKey: serviceKeys.ticketSummary(query),
    queryFn: () => service.ticketSummary(query),
  });
}

export function useServiceTicket(id: string) {
  return useQuery({ queryKey: serviceKeys.ticket(id), queryFn: () => service.ticket(id), enabled: Boolean(id) });
}

export function useSetTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, statusCode }: { id: string; statusCode: string }) => service.setTicketStatus(id, statusCode),
    onSuccess: (updated) => {
      qc.setQueryData(serviceKeys.ticket(updated.id), updated);
      void qc.invalidateQueries({ queryKey: ['service', 'tickets'] });
    },
  });
}

/** Yeni servis talebi (web ServiceRequestsPage "Yeni Talep"). */
export function useCreateServiceTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Parameters<typeof service.createTicket>[0],
    ) => service.createTicket(body),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['service', 'tickets'] });
      if (created?.id) qc.setQueryData(serviceKeys.ticket(created.id), created);
    },
  });
}

/** Teknisyen atama, açıklama/ciddiyet güncelleme, çözüm notu. */
export function useUpdateServiceTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Parameters<typeof service.updateTicket>[1],
    ) => service.updateTicket(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(serviceKeys.ticket(updated.id), updated);
      void qc.invalidateQueries({ queryKey: ['service', 'tickets'] });
    },
  });
}

/* ------------------------------------------------------- garanti akışı ---- */

function settleWarranty(qc: ReturnType<typeof useQueryClient>, ticketId: string, claim: WarrantyClaim | null) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: serviceKeys.warranty(ticketId) }),
    qc.setQueryData(serviceKeys.warranty(ticketId), claim),
    qc.invalidateQueries({ queryKey: ['service', 'tickets'] }),
  ]);
}

export function useServiceWarranty(ticketId: string) {
  return useQuery({
    queryKey: serviceKeys.warranty(ticketId),
    queryFn: () => service.warranty(ticketId),
    enabled: Boolean(ticketId),
  });
}

export function useUpdateWarrantyAssessment(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof service.updateWarrantyAssessment>[1]) =>
      service.updateWarrantyAssessment(ticketId, body),
    onSuccess: (updated) => void settleWarranty(qc, ticketId, updated),
  });
}

export function useSetWarrantyParts(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parts: WarrantyPartInput[]) => service.setWarrantyParts(ticketId, parts),
    onSuccess: (updated) => void settleWarranty(qc, ticketId, updated),
  });
}

export function useSubmitWarranty(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note?: string) => service.submitWarranty(ticketId, note),
    onSuccess: (updated) => void settleWarranty(qc, ticketId, updated),
  });
}

/** Süper yönetici kararı: onay veya ret. */
export function useDecideWarranty(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ decision, note }: { decision: 'approved' | 'rejected'; note?: string }) =>
      service.decideWarranty(ticketId, decision, note),
    onSuccess: (updated) => void settleWarranty(qc, ticketId, updated),
  });
}

export function useServiceComplaints(query: { search?: string; status?: string } = {}) {
  return useInfiniteQuery(
    infinite(serviceKeys.complaints(query), (page, pageSize) =>
      service.complaints({ page, pageSize, ...query })
    )
  );
}

export function useServiceComplaint(id: string) {
  return useQuery({
    queryKey: serviceKeys.complaint(id),
    queryFn: () => service.complaint(id),
    enabled: Boolean(id),
  });
}

function invalidateComplaint(qc: ReturnType<typeof useQueryClient>, id: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: serviceKeys.complaint(id) }),
    qc.invalidateQueries({ queryKey: ['service', 'complaints'] }),
    qc.invalidateQueries({ queryKey: ['service', 'tickets'] }),
  ]);
}

export function useUpdateServiceComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ServiceComplaintUpdateInput }) => service.updateComplaint(id, patch),
    onSuccess: (_updated, variables) => invalidateComplaint(qc, variables.id),
  });
}

export function useConvertServiceComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => service.convertComplaint(id),
    onSuccess: (_updated, id) => invalidateComplaint(qc, id),
  });
}

export function useRejectServiceComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ServiceComplaintRejectInput }) => service.rejectComplaint(id, body),
    onSuccess: (_updated, variables) => invalidateComplaint(qc, variables.id),
  });
}

export function useInstallations(query: { search?: string; phase?: 'planned' | 'ongoing' | 'done' } = {}) {
  return useInfiniteQuery(
    infinite(serviceKeys.installations(query), (page, pageSize) => service.installations({ page, pageSize, ...query }))
  );
}

export function useInstallation(id: string) {
  return useQuery({ queryKey: serviceKeys.installation(id), queryFn: () => service.installation(id), enabled: Boolean(id) });
}

export function useSetInstallationStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { statusCode: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'; installationDate?: string; formData?: Record<string, unknown> }) =>
      service.setInstallationStatus(id, body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: serviceKeys.installation(id) }),
        qc.invalidateQueries({ queryKey: ['service', 'installations'] }),
        qc.invalidateQueries({ queryKey: ['inventory', 'customer-devices'] }),
      ]);
    },
  });
}

export function useShipments(phase?: 'active' | 'arrived') {
  return useInfiniteQuery(
    infinite(serviceKeys.shipments(phase), (page, pageSize) => service.shipments({ page, pageSize, phase }))
  );
}

export function useShipment(id: string) {
  return useQuery({ queryKey: serviceKeys.shipment(id), queryFn: () => service.shipment(id), enabled: Boolean(id) });
}

/** Sevkiyat mutasyonları: detayı sunucu yanıtıyla değiştirir, listeleri tazeler. */
async function settleShipment(
  qc: ReturnType<typeof useQueryClient>,
  updated: Shipment
) {
  qc.setQueryData(serviceKeys.shipment(updated.id), updated);
  await Promise.all([qc.invalidateQueries({ queryKey: ['service', 'shipments'] })]);
}

export type ShipmentStatusCodeInput = 'preparing' | 'in_transit' | 'at_customs' | 'cleared' | 'delivered';

export function useStartShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, loadingDate }: { id: string; loadingDate?: string }) =>
      service.startShipment(id, loadingDate),
    onSuccess: (updated) => void settleShipment(qc, updated),
  });
}

export function useUpdateShipmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & {
      statusCode: ShipmentStatusCodeInput;
      destinationWarehouseId?: string;
      loadingDate?: string;
      arrivedAt?: string;
    }) => service.updateShipmentStatus(id, body),
    onSuccess: (updated) => void settleShipment(qc, updated),
  });
}

export function useMaintenancePlans(dueSoon?: boolean) {
  return useInfiniteQuery(
    infinite(serviceKeys.maintenance({ dueSoon }), (page, pageSize) =>
      service.maintenancePlans({ page, pageSize, dueSoon })
    )
  );
}

export function useDeviceMaintenancePlans(customerDeviceId: string) {
  return useInfiniteQuery({
    ...infinite(['service', 'maintenance', 'device', customerDeviceId], (page, pageSize) =>
      service.maintenancePlans({ page, pageSize, customerDeviceId })
    ),
    enabled: Boolean(customerDeviceId),
  });
}

export function useMaintenancePlan(id: string) {
  return useQuery({ queryKey: serviceKeys.maintenancePlan(id), queryFn: () => service.maintenancePlan(id), enabled: Boolean(id) });
}

export function useCompleteMaintenancePlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (servicedAt?: string) => service.completeMaintenancePlan(id, servicedAt),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: serviceKeys.maintenancePlan(id) }),
        qc.invalidateQueries({ queryKey: ['service', 'maintenance'] }),
      ]);
    },
  });
}

/** Makine kartından yeni bakım planı (web MaintenancePlanPanel). */
export function useCreateMaintenancePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof service.createMaintenancePlan>[0]) =>
      service.createMaintenancePlan(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['service', 'maintenance'] }),
  });
}

/** Plan düzenleme + duraklatma/aktifleştirme (isActive). */
export function useUpdateMaintenancePlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof service.updateMaintenancePlan>[1]) =>
      service.updateMaintenancePlan(id, body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: serviceKeys.maintenancePlan(id) }),
        qc.invalidateQueries({ queryKey: ['service', 'maintenance'] }),
      ]);
    },
  });
}

export function useCustomerDevices(query: { search?: string; preset?: 'warranty' | 'expired' } = {}) {  return useInfiniteQuery(
    infinite(serviceKeys.devices(query), (page, pageSize) => devices.list({ page, pageSize, ...query }))
  );
}

export function useCustomerDevice(id: string) {
  return useQuery({ queryKey: serviceKeys.device(id), queryFn: () => devices.get(id), enabled: Boolean(id) });
}

/**
 * Makine Parkı'nın tenant geneli listesinden ayrı: tek bileti/firmayı çözmek için
 * yalnızca o firmanın cihazlarını çeker, `companyId` gelene kadar kapalı kalır.
 * ponytail: yine de sayfalı (50) — firmanın 50'den çok cihazı varsa ilk sayfaya
 * denk gelmeyen bir seri no çözülmez; pratikte bir firmanın makine sayısı bunun
 * çok altında.
 */
export function useCustomerDevicesByCompany(companyId: string | undefined) {
  return useInfiniteQuery({
    ...infinite(serviceKeys.devices({ companyId }), (page, pageSize) => devices.list({ page, pageSize, companyId })),
    enabled: Boolean(companyId),
  });
}

/** Kurum içi kullanıcı dizini — id/fullName/email, oturum sahibi hariç (bkz. chat.service.ts `directory`).
 * İzin matrisi kullanılmaz (tüm çalışanlara açık), admin/users'ın aksine 403 riski yok. */

/** Makine silme (web MachinesPage ile aynı uç; geri alınamaz). */
export function useRemoveCustomerDevice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => devices.removeDevice(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: serviceKeys.device(id) }),
        qc.invalidateQueries({ queryKey: ['inventory', 'customer-devices'] }),
      ]);
    },
  });
}

/** Makineyi başka firmaya ata. */
export function useReassignCustomerDevice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId }: { companyId: string }) => devices.updateDevice(id, { companyId }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: serviceKeys.device(id) }),
        qc.invalidateQueries({ queryKey: ['inventory', 'customer-devices'] }),
      ]);
    },
  });
}

export function useDirectory() {
  return useQuery({ queryKey: ['chat', 'directory'], queryFn: () => chat.directory(), staleTime: REFERENCE_STALE_TIME });
}

/**
 * `service-ticket-statuses` lookup'ının gerçek kodları: open/in_progress/
 * waiting_customer/resolved/closed (bkz. db/seed/_data.ts). Tasarımdaki
 * "Yolda/Yerinde" alan-servisi adımları tezgah kurulumuna (Installation) ait;
 * servis talebinde karşılığı yok. Liste filtresi, Kanban kolonları ve detay
 * StepTrack'i aynı gerçek 4 aşamayı kullansın diye tek yerde toplandı.
 */
export const TICKET_PHASES = ['open', 'in_progress', 'waiting_customer', 'done'] as const;
export type TicketPhase = (typeof TICKET_PHASES)[number];

export const TICKET_PHASE_META: Record<TicketPhase, { label: string; tone: Tone }> = {
  open: { label: 'Açık', tone: 'info' },
  in_progress: { label: 'İşlemde', tone: 'warning' },
  waiting_customer: { label: 'Müşteri Bekleniyor', tone: 'stage' },
  done: { label: 'Tamamlandı', tone: 'success' },
};

/** resolved+closed tek "done" kolonunda birleşir; lookup henüz gelmediyse resolvedAt'e düşer. */
export function ticketPhase(ticket: Pick<ServiceTicket, 'status' | 'resolvedAt'>): TicketPhase {
  const code = ticket.status?.code;
  if (code === 'resolved' || code === 'closed') return 'done';
  if (code === 'open' || code === 'in_progress' || code === 'waiting_customer') return code;
  return ticket.resolvedAt ? 'done' : 'open';
}

/**
 * Sunucuda SLA alanı/hesaplaması YOK (`service_tickets` şemasında öyle bir sütun
 * yok, `service.controller.ts` doğrulandı). Web bunu hiç sunucudan istemiyor,
 * istemcide `severity` + `reportedAt`'ten hesaplıyor — aynı tabloyu birebir taşıdık
 * (bkz. ServicePages.tsx `SERVICE_SLA_DAYS`/`serviceSlaInfo`, satır ~348-372).
 */
const SERVICE_SLA_DAYS: Record<string, number> = { critical: 1, high: 2, normal: 7, low: 14 };

export function ticketSla(
  ticket: Pick<ServiceTicket, 'severity' | 'reportedAt' | 'status' | 'resolvedAt'>,
  now: number = Date.now()
): { text: string; overdue: boolean } | null {
  if (ticketPhase(ticket) === 'done') return { text: 'Kapandı', overdue: false };
  const reported = new Date(ticket.reportedAt).getTime();
  if (Number.isNaN(reported)) return null;
  const ageDays = Math.max(0, Math.floor((now - reported) / (24 * 60 * 60 * 1000)));
  const targetDays = SERVICE_SLA_DAYS[ticket.severity] ?? SERVICE_SLA_DAYS.normal!;
  const remaining = targetDays - ageDays;
  if (remaining < 0) return { text: `${Math.abs(remaining)}g aşıldı`, overdue: true };
  if (remaining === 0) return { text: 'Bugün doluyor', overdue: false };
  return { text: `${remaining}g kaldı`, overdue: false };
}
