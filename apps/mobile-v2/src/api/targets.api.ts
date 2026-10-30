import { request } from '@/src/api/client';
import type { TargetProgressResponse, TargetUpsertBody } from '@/src/ui/sales/targets-logic';

/** admin.controller.ts `GET /users` satırı; yalnız hedef seçicisinin kullandığı alanlar. */
export type DirectoryUser = {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  departmentId: string | null;
  department: { id: string; code: string; name: string } | null;
  roles: { code: string; name: string }[];
};

export type DirectoryDepartment = { id: string; code: string; name: string; description?: string | null };
export type DirectoryDivision = { id: string; code: string; name: string; sortOrder: number };

/** user_targets / department_targets / division_targets satırı (para alanları `numeric` → string). */
export type TargetRow = {
  id: string;
  period: string;
  currency: string;
  userId?: string;
  departmentId?: string;
  divisionId?: string;
  salesAmount: string | null;
  salesNewCustomers: number | null;
  serviceAmount: string | null;
  serviceCompleted: number | null;
  digitalLeadTarget: number | null;
  digitalConversionTarget: number | null;
  digitalBudget: string | null;
  visitTarget: number | null;
  callTarget: number | null;
  quoteTarget: number | null;
  targetItems: unknown;
  note: string | null;
  updatedAt: string;
};

export type TargetProgressScope = 'user' | 'department' | 'division' | 'all-users';

export const targetsApi = {
  users: () => request<DirectoryUser[]>('/users'),
  departments: () => request<DirectoryDepartment[]>('/departments'),
  divisions: () => request<DirectoryDivision[]>('/divisions'),

  userTargets: (period?: string) => request<TargetRow[]>('/user-targets', { query: { period } }),
  myTargets: (period?: string) => request<TargetRow[]>('/me/targets', { query: { period } }),
  saveUserTarget: (userId: string, body: TargetUpsertBody) =>
    request<TargetRow | null>(`/users/${encodeURIComponent(userId)}/targets`, { method: 'POST', body }),

  departmentTargets: (period?: string) => request<TargetRow[]>('/department-targets', { query: { period } }),
  saveDepartmentTarget: (departmentId: string, body: TargetUpsertBody) =>
    request<TargetRow | null>(`/departments/${encodeURIComponent(departmentId)}/targets`, { method: 'POST', body }),

  divisionTargets: (period?: string) => request<TargetRow[]>('/division-targets', { query: { period } }),
  saveDivisionTarget: (divisionId: string, body: TargetUpsertBody) =>
    request<TargetRow | null>(`/divisions/${encodeURIComponent(divisionId)}/targets`, { method: 'POST', body }),

  targetProgress: (query: { period: string; scope: TargetProgressScope; id?: string }) =>
    request<TargetProgressResponse>('/reports/target-progress', { query }),
  myTargetProgress: (period: string) =>
    request<TargetProgressResponse>('/reports/my-target-progress', { query: { period } }),
};
