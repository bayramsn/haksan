import { request, type Paginated } from '@/src/api/client';
import { collectPaginated } from './pagination';

export type TradeFairContactMethod = 'phone' | 'whatsapp' | 'email' | 'in_person' | 'other';

export type TradeFairFollowUp = {
  contacted: boolean;
  contactMethod: TradeFairContactMethod | null;
  contactDate: string | null;
  contactNotes: string | null;
  offerSent: boolean;
  customerConverted: boolean;
};

export type TradeFairContact = TradeFairFollowUp & {
  id: string;
  fairName: string;
  companyName: string;
  contactName: string;
  contactTitle: string | null;
  mobilePhone: string | null;
  email: string | null;
  country: string;
  province: string | null;
  district: string | null;
  productCategory: string | null;
  productType: string | null;
  notes: string | null;
  metByUserId: string | null;
  metByName: string | null;
  visitorCount: number;
  createdBy: string | null;
  createdAt: string;
};

export type TradeFairContactBody = Omit<TradeFairContact, 'id' | 'metByName' | 'createdBy' | 'createdAt'>;

export type TradeFairSummary = {
  fairs: { name: string; total: number; lastAt: string }[];
  byUser: { userId: string | null; fullName: string | null; meetings: number; people: number }[];
};

export type TradeFairStaff = { id: string; fullName: string };

export type TradeFairListQuery = { fairName?: string; q?: string; metByUserId?: string; page?: number; pageSize?: number };

/** `GET /files/links` satırı (API files.service listLinks). */
export type FileLinkRow = {
  id: string;
  entityType: string;
  entityId: string;
  file: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    uploadedBy: string | null;
    uploaderName: string | null;
  };
  documentType: { code: string | null; name: string | null } | null;
};

export const tradeFairsApi = {
  list: (query: TradeFairListQuery) => request<Paginated<TradeFairContact>>('/trade-fairs', { query }),
  summary: (fairName?: string) => request<TradeFairSummary>('/trade-fairs/summary', { query: { fairName } }),
  staff: () => request<TradeFairStaff[]>('/trade-fairs/staff'),
  create: (body: TradeFairContactBody) => request<TradeFairContact>('/trade-fairs', { method: 'POST', body }),
  update: (id: string, body: Partial<TradeFairContactBody>) =>
    request<TradeFairContact>(`/trade-fairs/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ deleted: boolean }>(`/trade-fairs/${id}`, { method: 'DELETE' }),
  attachments: (entityId: string) =>
    collectPaginated((page) => request<Paginated<FileLinkRow>>('/files/links', {
      query: { entityType: 'trade_fair_contact', entityId, page, pageSize: 100 },
    })),
};
