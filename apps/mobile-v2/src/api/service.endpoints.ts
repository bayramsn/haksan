import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomerDeviceCreateInput, ServiceComplaintCreateInput } from '@haksan/shared';
import { request } from './client';
import { serviceKeys } from './operations.hooks';
import type { CustomerDevice, Installation, ServiceTicket } from './endpoints';

/**
 * Servis fazı (D) için webde olup mobilde eksik kalan uçlar. Gövdeler sunucu
 * şemalarıyla aynı: service.controller.ts (installCreate/installUpdate),
 * inventory.controller.ts (customer-devices, consume-service-parts),
 * maintenance-plans.controller.ts, service-complaints.controller.ts.
 */

export type InstallationInput = {
  companyId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  quoteId?: string;
  customerDeviceId?: string | null;
  /** Web ile aynı kurulum tutanağı numarası (yalnız oluşturmada). */
  formData?: { formNo: string; machineId?: string };
  scheduledDate?: string | null;
  assignedToUserId?: string | null;
  location?: string | null;
  locationType?: 'istanbul_ici' | 'istanbul_disi' | null;
  durationMinutes?: number | null;
  notes?: string | null;
};

export const serviceExtras = {
  createDevice: (body: CustomerDeviceCreateInput) =>
    request<CustomerDevice>('/customer-devices', { method: 'POST', body }),
  createComplaint: (body: ServiceComplaintCreateInput) =>
    request<{ id: string }>('/service-complaints', { method: 'POST', body }),
  createInstallation: (body: InstallationInput) =>
    request<Installation>('/installations', { method: 'POST', body }),
  updateInstallation: (id: string, body: InstallationInput) =>
    request<Installation>(`/installations/${id}`, { method: 'PATCH', body }),
  removeMaintenancePlan: (id: string) => request<unknown>(`/maintenance-plans/${id}`, { method: 'DELETE' }),
  consumeServiceParts: (body: {
    serviceTicketId: string;
    companyId?: string;
    lines: { productModelId: string; quantity: number; notes?: string }[];
  }) => request<unknown>('/inventory/consume-service-parts', { method: 'POST', body }),
  updateTicketMetadata: (id: string, metadata: Record<string, unknown>) =>
    request<ServiceTicket>(`/service-tickets/${id}`, { method: 'PATCH', body: { metadata } }),
};

/** "YYYY-AA-GG" → yerel gece yarısının ISO'su; boşsa null, geçersizse undefined. */
export function parseDay(value: string): string | null | undefined {
  const text = value.trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d ? date.toISOString() : undefined;
}

/** ISO → "YYYY-AA-GG" (form alanını doldurmak için). */
export function dayText(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function useCreateCustomerDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: serviceExtras.createDevice,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inventory', 'customer-devices'] }),
  });
}

export function useCreateServiceComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: serviceExtras.createComplaint,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['service', 'complaints'] }),
  });
}

export function useSaveInstallation(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InstallationInput) =>
      id ? serviceExtras.updateInstallation(id, body) : serviceExtras.createInstallation(body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['service', 'installations'] }),
        id ? qc.invalidateQueries({ queryKey: serviceKeys.installation(id) }) : undefined,
      ]);
    },
  });
}

export function useRemoveMaintenancePlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => serviceExtras.removeMaintenancePlan(id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: serviceKeys.maintenancePlan(id) });
      void qc.invalidateQueries({ queryKey: ['service', 'maintenance'] });
    },
  });
}

/**
 * Web `consumeParts` ile aynı iki adım: stoktan düş, sonra servis işlemlerine
 * "Parça kullanımı:" satırı ekle. Stok düşüp metadata yazılamazsa hata yine
 * kullanıcıya gösterilir; stok hareketi zaten kalıcıdır (web de böyle).
 */
export function useConsumeServicePart(ticket: Pick<ServiceTicket, 'id' | 'companyId' | 'metadata'>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productModelId: string; label: string; quantity: number; notes?: string }) => {
      await serviceExtras.consumeServiceParts({
        serviceTicketId: ticket.id,
        companyId: ticket.companyId,
        lines: [{ productModelId: input.productModelId, quantity: input.quantity, notes: input.notes }],
      });
      const operations = Array.isArray(ticket.metadata?.operations) ? ticket.metadata.operations : [];
      const currency = typeof ticket.metadata?.serviceCurrency === 'string' ? ticket.metadata.serviceCurrency : 'TRY';
      return serviceExtras.updateTicketMetadata(ticket.id, {
        operations: [
          ...operations,
          {
            id: `srv-part-${Date.now()}`,
            description: `Parça kullanımı: ${input.label}`,
            quantity: input.quantity,
            unitPrice: 0,
            currency,
            kind: 'part',
            createdAt: new Date().toISOString(),
          },
        ],
      });
    },
    onSuccess: (updated) => {
      qc.setQueryData(serviceKeys.ticket(updated.id), updated);
      void qc.invalidateQueries({ queryKey: ['service', 'tickets'] });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export type StaffUser = {
  id: string;
  fullName: string;
  status?: string;
  roles?: { code: string; name: string }[];
  department?: { id: string; code: string; name: string } | null;
};

/**
 * Web formlarının "users" listesi: /admin/users (users.read). Yetki yoksa web'de de
 * liste boş kalır ve atama gönderilmez; burada da aynı davranış.
 */
export function useStaffUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => request<StaffUser[]>('/admin/users'),
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}

/** Web: role === "Service" veya department === "Servis"; yoksa tüm kullanıcılar. */
export function serviceStaff(users: StaffUser[] | undefined): StaffUser[] {
  const all = users ?? [];
  const service = all.filter((u) => (u.roles?.[0]?.name ?? u.roles?.[0]?.code) === 'Service' || u.department?.name === 'Servis');
  return service.length ? service : all;
}
