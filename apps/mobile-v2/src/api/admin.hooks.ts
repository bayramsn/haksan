import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  DepartmentCreateInput,
  DepartmentUpdateInput,
  LaserSelection,
  LaserSpec,
  MachineTemplateCreateInput,
  ProductSpecTemplateBatchInput,
  ProductSpecTemplateBulkCreateInput,
  ProductSpecTemplateCreateInput,
  ProductSpecTemplateUpdateInput,
  RoleCreateInput,
  RoleUpdateInput,
  TargetUpsertInput,
  TechnicalImportCommitRequest,
  TechnicalImportPreviewRequest,
  TenantUpdateInput,
  UserCreateInput,
  UserUpdateInput,
} from '@haksan/shared';
import {
  adminApi,
  type LaserImportPreview,
  type LaserProfileScope,
  type LookupWriteBody,
  type TargetProgressScope,
} from './admin.api';

export const adminKeys = {
  all: ['admin'] as const,
  users: ['admin', 'users'] as const,
  roles: ['admin', 'roles'] as const,
  permissions: ['admin', 'permissions'] as const,
  departments: ['admin', 'departments'] as const,
  divisions: ['admin', 'divisions'] as const,
  userTargets: (period: string): QueryKey => ['admin', 'targets', 'user', period],
  departmentTargets: (period: string): QueryKey => ['admin', 'targets', 'department', period],
  targets: ['admin', 'targets'] as const,
  roleMembers: (roleId: string): QueryKey => ['admin', 'roles', 'members', roleId],
  progress: (query: { period: string; scope: TargetProgressScope; id: string }): QueryKey => [
    'admin',
    'targets',
    'progress',
    query,
  ],
  audit: (resourceType: string): QueryKey => ['admin', 'audit', resourceType],
  tenant: ['admin', 'tenant'] as const,
  lookupNames: ['admin', 'lookups'] as const,
  lookupRows: (name: string, query?: object): QueryKey => ['admin', 'lookups', name, query ?? {}],
  lookupsOf: (name: string): QueryKey => ['admin', 'lookups', name],
  specTemplates: (query: object): QueryKey => ['admin', 'spec-templates', query],
  specTemplatesAll: ['admin', 'spec-templates'] as const,
  brands: (divisionId?: string): QueryKey => ['admin', 'brands', divisionId ?? 'all'],
  laserOptions: (scope: object): QueryKey => ['admin', 'laser', 'options', scope],
  laserResolve: (scope: object, selectionKey: string): QueryKey => ['admin', 'laser', 'resolve', scope, selectionKey],
  laserAll: ['admin', 'laser'] as const,
};

const STALE = 60 * 1000;

/* --------------------------------------------------------------- okumalar */

export function useAdminUsers(enabled = true) {
  return useQuery({ queryKey: adminKeys.users, queryFn: adminApi.users, staleTime: STALE, enabled });
}

export function useAdminRoles(enabled = true) {
  return useQuery({ queryKey: adminKeys.roles, queryFn: adminApi.roles, staleTime: STALE, enabled });
}

export function useAdminPermissions(enabled = true) {
  return useQuery({ queryKey: adminKeys.permissions, queryFn: adminApi.permissions, staleTime: 10 * STALE, enabled });
}

export function useAdminDepartments(enabled = true) {
  return useQuery({ queryKey: adminKeys.departments, queryFn: adminApi.departments, staleTime: STALE, enabled });
}

export function useAdminDivisions(enabled = true) {
  return useQuery({ queryKey: adminKeys.divisions, queryFn: adminApi.divisions, staleTime: 10 * STALE, enabled });
}

export function useUserTargets(period: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.userTargets(period),
    queryFn: () => adminApi.userTargets(period),
    staleTime: STALE,
    enabled,
  });
}

export function useDepartmentTargets(period: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.departmentTargets(period),
    queryFn: () => adminApi.departmentTargets(period),
    staleTime: STALE,
    enabled,
  });
}

export function useRoleTargetMembers(roleId: string) {
  return useQuery({
    queryKey: adminKeys.roleMembers(roleId),
    queryFn: () => adminApi.roleTargetMembers(roleId),
    enabled: Boolean(roleId),
  });
}

/** Canlı gerçekleşme: web diyaloğu gibi 60 sn'de bir tazelenir. */
export function useTargetProgress(query: { period: string; scope: TargetProgressScope; id: string }) {
  return useQuery({
    queryKey: adminKeys.progress(query),
    queryFn: () => adminApi.targetProgress(query),
    enabled: Boolean(query.id),
    refetchInterval: 60 * 1000,
  });
}

export function useAuditLogs(resourceType: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.audit(resourceType),
    queryFn: () => adminApi.auditLogs({ resourceType, page: 1, pageSize: 8 }),
    enabled,
  });
}

export function useTenantSettings() {
  return useQuery({ queryKey: adminKeys.tenant, queryFn: adminApi.tenant, staleTime: STALE });
}

export function useAdminLookupNames(enabled = true) {
  return useQuery({ queryKey: adminKeys.lookupNames, queryFn: adminApi.lookups, staleTime: 10 * STALE, enabled });
}

export function useLookupRows(
  name: string,
  query?: { divisionId?: string; scope?: string; parentId?: string },
  enabled = true
) {
  return useQuery({
    queryKey: adminKeys.lookupRows(name, query),
    queryFn: () => adminApi.lookupRows(name, query),
    enabled: enabled && Boolean(name),
    staleTime: STALE,
  });
}

export function useSpecTemplates(query: { productTypeCode?: string; divisionId?: string }, enabled = true) {
  return useQuery({
    queryKey: adminKeys.specTemplates(query),
    queryFn: () => adminApi.productSpecTemplates(query),
    enabled,
    staleTime: STALE,
  });
}

/* --------------------------------------------------------------- yazmalar */

function invalidate(qc: ReturnType<typeof useQueryClient>, key: QueryKey) {
  return () => void qc.invalidateQueries({ queryKey: key });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: UserCreateInput) => adminApi.createUser(body), onSuccess: invalidate(qc, adminKeys.users) });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UserUpdateInput }) => adminApi.updateUser(id, body),
    onSuccess: invalidate(qc, adminKeys.users),
  });
}

export function useUnlockUser() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => adminApi.unlockUser(id), onSuccess: invalidate(qc, adminKeys.users) });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => adminApi.deleteUser(id), onSuccess: invalidate(qc, adminKeys.users) });
}

export function useSaveUserTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: TargetUpsertInput }) => adminApi.saveUserTarget(userId, body),
    onSuccess: invalidate(qc, adminKeys.targets),
  });
}

export function useSaveDepartmentTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body }: { departmentId: string; body: TargetUpsertInput }) =>
      adminApi.saveDepartmentTarget(departmentId, body),
    onSuccess: invalidate(qc, adminKeys.targets),
  });
}

export function useSaveRoleTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, body }: { roleId: string; body: TargetUpsertInput }) => adminApi.saveRoleTarget(roleId, body),
    onSuccess: invalidate(qc, adminKeys.targets),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: RoleCreateInput) => adminApi.createRole(body), onSuccess: invalidate(qc, adminKeys.roles) });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoleUpdateInput }) => adminApi.updateRole(id, body),
    onSuccess: invalidate(qc, adminKeys.roles),
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DepartmentCreateInput) => adminApi.createDept(body),
    onSuccess: invalidate(qc, adminKeys.departments),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DepartmentUpdateInput }) => adminApi.updateDept(id, body),
    onSuccess: invalidate(qc, adminKeys.departments),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => adminApi.deleteDept(id), onSuccess: invalidate(qc, adminKeys.departments) });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TenantUpdateInput) => adminApi.updateTenant(body),
    onSuccess: (tenant) => qc.setQueryData(adminKeys.tenant, tenant),
  });
}

/** Lookup yazımları liste + geçmiş panelini birlikte tazeler. */
function settleLookup(qc: ReturnType<typeof useQueryClient>, name: string) {
  void qc.invalidateQueries({ queryKey: adminKeys.lookupsOf(name) });
  void qc.invalidateQueries({ queryKey: adminKeys.audit(`lookup:${name}`) });
}

export function useCreateLookup(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LookupWriteBody & { name: string }) => adminApi.createLookup(name, body),
    onSuccess: () => settleLookup(qc, name),
  });
}

export function useUpdateLookup(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LookupWriteBody }) => adminApi.updateLookup(name, id, body),
    onSuccess: () => settleLookup(qc, name),
  });
}

export function useReorderLookup(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => adminApi.reorderLookup(name, items),
    onSettled: () => settleLookup(qc, name),
  });
}

export function useDeleteLookup(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteLookup(name, id),
    onSuccess: () => settleLookup(qc, name),
  });
}

function settleSpecs(qc: ReturnType<typeof useQueryClient>) {
  return () => void qc.invalidateQueries({ queryKey: adminKeys.specTemplatesAll });
}

export function useCreateSpecTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProductSpecTemplateCreateInput) => adminApi.createProductSpecTemplate(body),
    onSuccess: settleSpecs(qc),
  });
}

export function useUpdateSpecTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProductSpecTemplateUpdateInput }) =>
      adminApi.updateProductSpecTemplate(id, body),
    onSuccess: settleSpecs(qc),
  });
}

export function useDeleteSpecTemplate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => adminApi.deleteProductSpecTemplate(id), onSuccess: settleSpecs(qc) });
}

export function useBulkCreateSpecTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: ProductSpecTemplateBulkCreateInput['items']) => adminApi.bulkCreateProductSpecTemplates(items),
    onSuccess: settleSpecs(qc),
  });
}

export function useBatchSaveSpecTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProductSpecTemplateBatchInput) => adminApi.batchSaveProductSpecTemplates(body),
    onSuccess: settleSpecs(qc),
  });
}

export function useCreateMachineTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MachineTemplateCreateInput) => adminApi.createMachineTemplate(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.specTemplatesAll });
      void qc.invalidateQueries({ queryKey: adminKeys.lookupsOf('product-types') });
    },
  });
}

export function usePreviewTechnicalImport() {
  return useMutation({ mutationFn: (body: TechnicalImportPreviewRequest) => adminApi.previewTechnicalImport(body) });
}

export function useCommitTechnicalImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TechnicalImportCommitRequest) => adminApi.commitTechnicalImport(body),
    onSuccess: settleSpecs(qc),
  });
}

/* ------------------------------------------------- lazer teknik profilleri */

export function useCatalogBrands(divisionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: adminKeys.brands(divisionId),
    queryFn: () => adminApi.listBrands(divisionId),
    enabled: enabled && Boolean(divisionId),
    staleTime: STALE,
  });
}

export function useLaserOptions(scope: LaserProfileScope | null) {
  return useQuery({
    queryKey: adminKeys.laserOptions(scope ?? {}),
    queryFn: () => adminApi.laserOptions(scope!),
    enabled: Boolean(scope),
    staleTime: 10 * STALE,
  });
}

/** Seçim tamamlandığında (model dahil) profili çözer; düzenleme taslağı ekranda tutulur. */
export function useLaserResolve(scope: LaserProfileScope | null, selection: LaserSelection | null, selectionKey: string) {
  return useQuery({
    queryKey: adminKeys.laserResolve(scope ?? {}, selectionKey),
    queryFn: () => adminApi.laserResolve(scope!, selection!),
    enabled: Boolean(scope && selection),
    staleTime: 0,
    gcTime: 0,
  });
}

export function useLaserSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scope, selection, specs }: { scope: LaserProfileScope; selection: LaserSelection; specs: LaserSpec[] }) =>
      adminApi.laserSave(scope, selection, specs),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.laserAll }),
  });
}

export function useLaserPreviewImport() {
  return useMutation({
    mutationFn: ({ scope, file }: { scope: LaserProfileScope; file: { fileName: string; mimeType?: string; fileBase64: string } }) =>
      adminApi.laserPreviewImport(scope, file),
  });
}

export function useLaserCommitImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scope, preview }: { scope: LaserProfileScope; preview: Pick<LaserImportPreview, 'importToken' | 'laserProfiles'> }) =>
      adminApi.laserCommitImport(scope, preview),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.laserAll }),
  });
}
