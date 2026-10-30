import type {
  DepartmentCreateInput,
  DepartmentUpdateInput,
  LaserCatalogModel,
  LaserIssue,
  LaserSelection,
  LaserSpec,
  LaserTechnicalConfiguration,
  MachineTemplateCreateInput,
  ProductSpecTemplateBatchInput,
  ProductSpecTemplateBulkCreateInput,
  ProductSpecTemplateCreateInput,
  ProductSpecTemplateUpdateInput,
  RoleCreateInput,
  RoleUpdateInput,
  TargetUpsertInput,
  TechnicalImportCommitRequest,
  TechnicalImportLayout,
  TechnicalImportPreviewRequest,
  TechnicalImportRowInput,
  TenantUpdateInput,
  UserCreateInput,
  UserUpdateInput,
} from '@haksan/shared';
import { request, type Paginated } from '@/src/api/client';

/* Yanıt biçimleri apps/api/src/modules/admin/admin.controller.ts ve admin-lookups.controller.ts'den. */

export type AdminUserScope = {
  resource: string;
  departmentId: string | null;
  divisionId: string | null;
  isPrimary: boolean;
};

export type AdminUser = {
  id: string;
  email: string;
  username: string | null;
  fullName: string;
  phone: string | null;
  status: string;
  departmentId: string | null;
  department: { id: string; code: string; name: string } | null;
  titleId: string | null;
  title: { id: string; code: string; name: string } | null;
  purchaseApprovalLimit: number | string | null;
  managerId: string | null;
  lastLoginAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  mfaEnabled: boolean;
  roles: { code: string; name: string }[];
  divisions: { id: string; code: string; name: string; isPrimary: boolean }[];
  accessScopes: AdminUserScope[];
};

export type AdminRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  permissions: { code: string; name: string }[];
};

export type AdminPermission = {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
};

export type AdminDepartment = { id: string; code: string; name: string; description: string | null };
export type AdminDivision = { id: string; code: string; name: string; sortOrder: number };

/** Hedef satırı: user_targets / department_targets tablosu (sayılar numeric → string gelebilir). */
export type TargetRow = {
  id: string;
  userId?: string;
  departmentId?: string;
  period: string;
  currency: string;
  salesAmount: string | number | null;
  salesNewCustomers: number | null;
  serviceAmount: string | number | null;
  serviceCompleted: number | null;
  digitalLeadTarget: number | null;
  digitalConversionTarget: number | null;
  digitalBudget: string | number | null;
  visitTarget: number | null;
  callTarget: number | null;
  quoteTarget: number | null;
  targetItems: unknown;
  note: string | null;
};

export type RoleTargetMembers = {
  roleCode: string;
  roleName: string;
  memberCount: number;
  members: { userId: string; fullName: string }[];
};

export type TargetProgressScope = 'user' | 'department' | 'division' | 'role';
export type TargetProgress = {
  subjects?: { metrics?: Record<string, { target: number | null; actual: number | null; pct: number | null }>; hasTarget?: boolean }[];
};

export type AuditLogRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string | null; fullName: string | null; email: string | null } | null;
};

export type TenantSettings = {
  id: string;
  name: string;
  slug: string;
  taxNumber: string | null;
  email: string | null;
  phone: string | null;
  hiddenNavigationKeys: string[];
  /** Yalnız `tenants.update` yetkisinde döner. */
  userReportRecipients?: string[];
};

export type LookupRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  province?: string | null;
  divisionId?: string | null;
  productGroupId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  productTypeIds?: string[];
  companyId?: string | null;
  companyName?: string | null;
  companyNo?: string | null;
  supplierCompanyId?: string | null;
  supplierCompanyName?: string | null;
  technicalCatalogCode?: 'AORE_LASER' | null;
  isOwned?: boolean;
  logoFileId?: string | null;
  logoUrl?: string | null;
};

export type LookupWriteBody = {
  code?: string;
  name?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
  province?: string;
  divisionId?: string | null;
  parentId?: string | null;
  productTypeIds?: string[];
  companyId?: string | null;
  supplierCompanyId?: string | null;
  technicalCatalogCode?: 'AORE_LASER' | null;
  isOwned?: boolean;
  logoFileId?: string | null;
};

export type LookupDeleteResult = { ok: true; deleted: boolean; deactivated: boolean };

export type SpecTemplateRow = {
  id: string;
  productTypeCode: string;
  specKey: string;
  specGroupCode: string | null;
  defaultValue: string | null;
  specUnit: string | null;
  specOptions: string[] | null;
  divisionId: string | null;
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  updatedAt?: string;
};

export type TechnicalImportPreview = {
  file: { name: string; sheetNames: string[]; rowCount: number };
  divisionId?: string;
  layout?: TechnicalImportLayout;
  rows: TechnicalImportRowInput[];
  summary: { total: number; exact: number; normalized: number; review: number; unmatched: number; ready: number };
  suggestedProducts: {
    id: string;
    modelCode: string;
    fullName: string;
    brandName?: string | null;
    productTypeCode?: string | null;
    label: string;
    score: number;
  }[];
};

export type CatalogBrand = {
  id: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
  technicalCatalogCode?: string | null;
};

export type LaserProfileScope = { divisionId: string; brandId: string };
export type LaserProfileOptions = {
  models: Pick<LaserCatalogModel, 'code' | 'series' | 'productTypeCode' | 'sizeLabel' | 'standardCabin' | 'powerMin' | 'powerMax'>[];
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

export const adminApi = {
  /* ------------------------------------------------- lazer teknik profilleri */
  listBrands: (divisionId?: string) => request<CatalogBrand[]>('/brands', { query: { divisionId } }),
  laserOptions: (scope: { divisionId: string; brandId?: string }) =>
    request<LaserProfileOptions>('/laser-profiles/options', { query: scope }),
  laserResolve: (scope: LaserProfileScope, selection: LaserSelection) =>
    request<LaserTechnicalConfiguration>('/laser-profiles/resolve', {
      query: {
        ...scope,
        sourceRevision: selection.sourceRevision,
        productTypeCode: selection.productTypeCode,
        series: selection.series,
        cabinType: selection.cabinType,
        powerKw: selection.powerKw,
        sourceModelCode: selection.sourceModelCode,
      },
    }),
  laserSave: (scope: LaserProfileScope, selection: LaserSelection, specs: LaserSpec[]) =>
    request<LaserTechnicalConfiguration & { syncedProductCount: number }>('/admin/laser-profiles', {
      method: 'PUT',
      body: { ...scope, selection, specs },
    }),
  laserPreviewImport: (scope: LaserProfileScope, file: { fileName: string; mimeType?: string; fileBase64: string }) =>
    request<LaserImportPreview>('/admin/technical-import/preview', {
      method: 'POST',
      timeoutMs: 120_000,
      body: {
        ...scope,
        ...file,
        mode: 'laser_profiles',
        productTypeCode: 'FIBER_LAZER_KESIM',
        availableFields: [],
        includeCatalogModels: true,
      },
    }),
  laserCommitImport: (scope: LaserProfileScope, preview: Pick<LaserImportPreview, 'importToken' | 'laserProfiles'>) =>
    request<{ ok: boolean; created: number; updated: number; imported: number; syncedProductCount: number }>(
      '/admin/technical-import/commit',
      {
        method: 'POST',
        timeoutMs: 120_000,
        body: {
          ...scope,
          importToken: preview.importToken,
          laserSelections: preview.laserProfiles.map((profile) => profile.selection),
          mode: 'laser_profiles',
          productTypeCode: 'FIBER_LAZER_KESIM',
          rows: [],
        },
      }
    ),

  /* ------------------------------------------------------------ kullanıcılar */
  users: () => request<AdminUser[]>('/users'),
  createUser: (body: UserCreateInput) =>
    request<{ id: string; email: string; username: string; fullName: string }>('/users', { method: 'POST', body }),
  updateUser: (id: string, body: UserUpdateInput) => request<{ ok: true }>(`/users/${id}`, { method: 'PATCH', body }),
  unlockUser: (id: string) =>
    request<{ ok: true; id: string; failedLoginAttempts: number; lockedUntil: null }>(`/users/${id}/unlock`, {
      method: 'POST',
      body: {},
    }),
  deleteUser: (id: string) => request<{ ok: true }>(`/users/${id}`, { method: 'DELETE' }),

  /* ------------------------------------------------------------------ hedefler */
  userTargets: (period: string) => request<TargetRow[]>('/user-targets', { query: { period } }),
  saveUserTarget: (userId: string, body: TargetUpsertInput) =>
    request<TargetRow | null>(`/users/${userId}/targets`, { method: 'POST', body }),
  departmentTargets: (period: string) => request<TargetRow[]>('/department-targets', { query: { period } }),
  saveDepartmentTarget: (departmentId: string, body: TargetUpsertInput) =>
    request<TargetRow | null>(`/departments/${departmentId}/targets`, { method: 'POST', body }),
  saveRoleTarget: (roleId: string, body: TargetUpsertInput) =>
    request<{ ok: true; roleCode: string; period: string; updatedUserCount: number }>(`/roles/${roleId}/targets`, {
      method: 'POST',
      body,
    }),
  roleTargetMembers: (roleId: string) => request<RoleTargetMembers>(`/roles/${roleId}/target-members`),
  targetProgress: (query: { period: string; scope: TargetProgressScope; id: string }) =>
    request<TargetProgress>('/reports/target-progress', { query }),

  /* ------------------------------------------------------------ roller/izinler */
  roles: () => request<AdminRole[]>('/roles'),
  createRole: (body: RoleCreateInput) => request<AdminRole>('/roles', { method: 'POST', body }),
  updateRole: (id: string, body: RoleUpdateInput) => request<{ ok: true }>(`/roles/${id}`, { method: 'PATCH', body }),
  permissions: () => request<AdminPermission[]>('/permissions'),

  /* ------------------------------------------------------ departman / bölüm */
  departments: () => request<AdminDepartment[]>('/departments'),
  divisions: () => request<AdminDivision[]>('/divisions'),
  createDept: (body: DepartmentCreateInput) => request<AdminDepartment>('/departments', { method: 'POST', body }),
  updateDept: (id: string, body: DepartmentUpdateInput) =>
    request<AdminDepartment>(`/departments/${id}`, { method: 'PATCH', body }),
  deleteDept: (id: string) => request<{ ok: true; id: string }>(`/departments/${id}`, { method: 'DELETE' }),

  /* --------------------------------------------------------- denetim / kiracı */
  auditLogs: (query: { resourceType?: string; actorUserId?: string; page?: number; pageSize?: number }) =>
    request<Paginated<AuditLogRow>>('/audit-logs', { query }),
  tenant: () => request<TenantSettings>('/tenant'),
  updateTenant: (body: TenantUpdateInput) => request<TenantSettings>('/tenant', { method: 'PATCH', body }),

  /* ---------------------------------------------------------------- lookup'lar */
  lookups: () => request<{ available: string[] }>('/admin/lookups'),
  lookupRows: (name: string, query?: { divisionId?: string; scope?: string; parentId?: string; city?: string }) =>
    request<LookupRow[]>(`/admin/lookups/${name}`, { query }),
  createLookup: (name: string, body: LookupWriteBody & { name: string }) =>
    request<LookupRow>(`/admin/lookups/${name}`, { method: 'POST', body }),
  updateLookup: (name: string, id: string, body: LookupWriteBody) =>
    request<LookupRow>(`/admin/lookups/${name}/${id}`, { method: 'PATCH', body }),
  reorderLookup: (name: string, items: { id: string; sortOrder: number }[]) =>
    request<{ ok: true; items: { id: string; sortOrder: number }[] }>(`/admin/lookups/${name}/reorder`, {
      method: 'PATCH',
      body: { items },
    }),
  deleteLookup: (name: string, id: string) =>
    request<LookupDeleteResult>(`/admin/lookups/${name}/${id}`, { method: 'DELETE' }),

  /* ---------------------------------------------------- teknik bilgi şablonları */
  productSpecTemplates: (query: { productTypeCode?: string; divisionId?: string; scope?: string }) =>
    request<SpecTemplateRow[]>('/admin/product-spec-templates', { query }),
  createProductSpecTemplate: (body: ProductSpecTemplateCreateInput) =>
    request<SpecTemplateRow>('/admin/product-spec-templates', { method: 'POST', body }),
  bulkCreateProductSpecTemplates: (items: ProductSpecTemplateBulkCreateInput['items']) =>
    request<{ ok: boolean; created: number; skipped: number; rows: SpecTemplateRow[] }>(
      '/admin/product-spec-templates/bulk',
      { method: 'POST', body: { items } }
    ),
  batchSaveProductSpecTemplates: (body: ProductSpecTemplateBatchInput) =>
    request<{ ok: boolean; rows: SpecTemplateRow[]; prunedIds: string[] }>('/admin/product-spec-templates/batch', {
      method: 'PUT',
      body,
    }),
  updateProductSpecTemplate: (id: string, body: ProductSpecTemplateUpdateInput) =>
    request<SpecTemplateRow>(`/admin/product-spec-templates/${id}`, { method: 'PATCH', body }),
  deleteProductSpecTemplate: (id: string) =>
    request<{ ok: true }>(`/admin/product-spec-templates/${id}`, { method: 'DELETE' }),
  createMachineTemplate: (body: MachineTemplateCreateInput) =>
    request<{ type: LookupRow; specs: SpecTemplateRow[] }>('/admin/machine-templates', { method: 'POST', body }),
  previewTechnicalImport: (body: TechnicalImportPreviewRequest) =>
    request<TechnicalImportPreview>('/admin/technical-import/preview', { method: 'POST', body, timeoutMs: 120_000 }),
  commitTechnicalImport: (body: TechnicalImportCommitRequest) =>
    request<{ ok: boolean; created: number; updated: number; imported: number; productId?: string }>(
      '/admin/technical-import/commit',
      { method: 'POST', body, timeoutMs: 120_000 }
    ),
};
