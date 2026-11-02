import { request, type Paginated } from '@/src/api/client';
import { collectPaginated } from './pagination';

export type TradeFairContact = {
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
  /** İlgilenilen CRM ürünleri (isteğe bağlı, birden çok). */
  products: Array<{ id: string; name: string }>;
  notes: string | null;
  metByUserId: string | null;
  metByName: string | null;
  /** Görüşmenin bölümü (CNC / Üniversal / Sac İşleme); yeni kayıtta zorunlu. */
  divisionId: string | null;
  divisionName?: string | null;
  visitorCount: number;
  /** Firmalar'a eklendiyse bağlandığı firma/kontak. */
  companyId: string | null;
  contactId: string | null;
  linkedCompanyName?: string | null;
  /** Fuar sonrası arandı işareti; doluysa arandı. */
  calledAt?: string | null;
  calledBy?: string | null;
  calledByName?: string | null;
  /** Teklif verildi işareti; doluysa teklif verildi. */
  quotedAt?: string | null;
  quotedBy?: string | null;
  quotedByName?: string | null;
  /** Kayıttan açılan fırsat (varsa). */
  opportunityId?: string | null;
  createdBy: string | null;
  createdAt: string;
};
export type TradeFairContactBody = import("@haksan/shared").TradeFairContactInput;
export type TradeFairFlags = { called: boolean; quoted: boolean };
export type TradeFairDivision = { id: string; code: string; name: string };
export type TradeFairProduct = { id: string; name: string; category: string | null };

export type TradeFairSummary = {
  fairs: { name: string; total: number; lastAt: string }[];
  byUser: { userId: string | null; fullName: string | null; meetings: number; people: number }[];
};

export type TradeFairStaff = { id: string; fullName: string };

export type TradeFairListQuery = { fairName?: string; q?: string; metByUserId?: string; divisionId?: string; province?: string; district?: string; page?: number; pageSize?: number };

export type TradeFairPhotosQuery = { fairName?: string; q?: string; page?: number; pageSize?: number };

/** `GET /trade-fairs/photos` satırı (web TradeFairPhotoDTO). */
export type TradeFairPhoto = {
  fileId: string;
  filename: string;
  mimeType: string;
  createdAt: string;
  contactId: string;
  fairName: string;
  companyName: string;
  contactName: string;
};

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
  photos: (query: TradeFairPhotosQuery) => request<Paginated<TradeFairPhoto>>('/trade-fairs/photos', { query }),
  summary: (fairName?: string) => request<TradeFairSummary>('/trade-fairs/summary', { query: { fairName } }),
  staff: () => request<TradeFairStaff[]>('/trade-fairs/staff'),
  divisions: () => request<TradeFairDivision[]>('/trade-fairs/divisions'),
  products: (divisionId: string, q?: string) => request<TradeFairProduct[]>('/trade-fairs/products', { query: { divisionId, q } }),
  setCalled: (id: string, called: boolean) => request<TradeFairContact>(`/trade-fairs/${id}/called`, { method: 'PATCH', body: { called } }),
  setQuoted: (id: string, quoted: boolean) => request<TradeFairContact>(`/trade-fairs/${id}/quoted`, { method: 'PATCH', body: { quoted } }),
  toCompany: (id: string, body: { companyId?: string; divisionIds?: string[] }) =>
    request<TradeFairContact>(`/trade-fairs/${id}/company`, { method: 'POST', body }),
  toOpportunity: (id: string, body: { qualificationStage: 'lead' | 'c' | 'b' | 'a' | 'a_plus'; divisionId?: string }) =>
    request<{ opportunityId: string; qualificationStage: string; requestedStage: string; blockers: string[] }>(`/trade-fairs/${id}/opportunity`, { method: 'POST', body }),
  create: (body: TradeFairContactBody) => request<TradeFairContact>('/trade-fairs', { method: 'POST', body }),
  update: (id: string, body: Partial<TradeFairContactBody>) =>
    request<TradeFairContact>(`/trade-fairs/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ deleted: boolean }>(`/trade-fairs/${id}`, { method: 'DELETE' }),
  attachments: (entityId: string) =>
    collectPaginated((page) => request<Paginated<FileLinkRow>>('/files/links', {
      query: { entityType: 'trade_fair_contact', entityId, page, pageSize: 100 },
    })),
};
