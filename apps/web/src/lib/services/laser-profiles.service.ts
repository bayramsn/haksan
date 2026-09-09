import type { LaserCatalogModel, LaserIssue, LaserSelection, LaserSpec, LaserTechnicalConfiguration } from '@haksan/shared';
import { api } from '../apiClient';

export type LaserProfileScope = { divisionId: string; brandId: string };
export type LaserProfileOptions = {
  models: Array<Pick<LaserCatalogModel, 'code' | 'series' | 'productTypeCode' | 'sizeLabel' | 'standardCabin' | 'powerMin' | 'powerMax'>>;
  powerOptions: LaserSelection['powerKw'][];
  cabinOptions: LaserSelection['cabinType'][];
};
export type LaserImportPreview = {
  importToken: string;
  file: { name?: string; fileName?: string };
  laserProfiles: LaserTechnicalConfiguration[];
  issues: LaserIssue[];
  summary: { total: number; ready: number };
};

function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
  return `?${params.toString()}`;
}

export const laserProfilesService = {
  options: (scope: { divisionId: string; brandId?: string }, signal?: AbortSignal) =>
    api.get<LaserProfileOptions>(`/laser-profiles/options${query(scope)}`, { signal }),
  resolve: (scope: LaserProfileScope, selection: LaserSelection, signal?: AbortSignal) =>
    api.get<LaserTechnicalConfiguration>(`/laser-profiles/resolve${query({ ...scope, ...selection })}`, { signal }),
  save: (scope: LaserProfileScope, selection: LaserSelection, specs: LaserSpec[]) =>
    api.put<LaserTechnicalConfiguration>('/admin/laser-profiles', { ...scope, selection, specs }),
  previewImport: (scope: LaserProfileScope, file: { fileName: string; mimeType?: string; fileBase64: string }, signal?: AbortSignal) =>
    api.post<LaserImportPreview>('/admin/technical-import/preview', {
      ...scope, ...file, mode: 'laser_profiles', productTypeCode: 'FIBER_LAZER_KESIM', availableFields: [], includeCatalogModels: true,
    }, { signal }),
  commitImport: (scope: LaserProfileScope, preview: Pick<LaserImportPreview, 'importToken' | 'laserProfiles'>) =>
    api.post<{ ok: boolean; created: number; updated: number; imported: number }>('/admin/technical-import/commit', {
      ...scope, importToken: preview.importToken, laserSelections: preview.laserProfiles.map((profile) => profile.selection),
      mode: 'laser_profiles', productTypeCode: 'FIBER_LAZER_KESIM', rows: [],
    }),
};
