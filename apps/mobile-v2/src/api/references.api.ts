import type { CompanyReferenceImportResult } from '@haksan/shared';
import { request } from '@/src/api/client';

export type ReferenceRecord = {
  id: string;
  firm: string;
  contact: string | null;
  district: string | null;
  city: string | null;
  brand: string | null;
  model: string | null;
  deliveryDate: string | null;
  notes: string | null;
};

/** packages/shared companyReferenceCreateSchema alan kümesi. */
export type ReferenceInput = {
  firm: string;
  contact?: string;
  district?: string;
  city?: string;
  brand?: string;
  model?: string;
  deliveryDate?: string;
  notes?: string;
};

export type ReferenceImportResult = CompanyReferenceImportResult;

export const referencesApi = {
  list: () => request<ReferenceRecord[]>('/references'),
  create: (body: ReferenceInput) => request<ReferenceRecord>('/references', { method: 'POST', body }),
  importFile: (body: { fileName: string; fileBase64: string }) =>
    request<ReferenceImportResult>('/references/import', { method: 'POST', body }),
  update: (id: string, body: ReferenceInput) => request<ReferenceRecord>(`/references/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<unknown>(`/references/${id}`, { method: 'DELETE' }),
};
