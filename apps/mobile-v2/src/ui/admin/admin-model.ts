/**
 * Kullanıcı / rol / departman yönetiminin saf mantığı — web `UsersPage`,
 * `UserAdminDialogs`, `RolesPage`, `DepartmentsPage` yardımcılarının aynası.
 */

/* ------------------------------------------------------------- kullanıcılar */

export type UserStatusFilter = 'all' | 'active' | 'passive' | 'locked';

type LockInfo = { lockedUntil?: string | null };
type FilterableUser = LockInfo & {
  fullName: string;
  email: string;
  username?: string | null;
  status: string;
  department?: { name: string } | null;
  roles: { name: string }[];
  divisions: { name: string }[];
};

export const isUserLocked = (user: LockInfo, now = Date.now()) => {
  if (!user.lockedUntil) return false;
  const time = new Date(user.lockedUntil).getTime();
  return Number.isFinite(time) && time > now;
};

export const isUserActive = (user: { status: string }) => user.status !== 'passive';

export function userKpis(users: FilterableUser[], now = Date.now()) {
  const locked = users.filter((user) => isUserLocked(user, now)).length;
  const active = users.filter((user) => isUserActive(user) && !isUserLocked(user, now)).length;
  return { total: users.length, active, locked };
}

export function filterUsers<T extends FilterableUser>(
  users: T[],
  query: string,
  status: UserStatusFilter,
  now = Date.now()
): T[] {
  const term = query.trim().toLocaleLowerCase('tr-TR');
  return users.filter((user) => {
    const haystack = [
      user.fullName,
      user.email,
      user.username,
      user.department?.name,
      ...user.roles.map((role) => role.name),
      ...user.divisions.map((division) => division.name),
    ];
    const matchesTerm =
      !term || haystack.filter(Boolean).some((value) => String(value).toLocaleLowerCase('tr-TR').includes(term));
    const locked = isUserLocked(user, now);
    const matchesStatus =
      status === 'all' ||
      (status === 'locked' && locked) ||
      (status === 'active' && isUserActive(user) && !locked) ||
      (status === 'passive' && !isUserActive(user));
    return matchesTerm && matchesStatus;
  });
}

/** Seçim sırasını korur — ilk seçilen birincil (varsayılan aktif) bölüm olur. */
export const toggleOrdered = (current: string[], id: string, checked: boolean) =>
  checked ? [...current.filter((value) => value !== id), id] : current.filter((value) => value !== id);

/** Rol kodları: tekil + alfabetik (web `toggleRole`). */
export const toggleSorted = (current: string[], code: string, checked: boolean) =>
  checked ? [...new Set([...current, code])].sort() : current.filter((value) => value !== code);

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('tr-TR');
}

/* --------------------------------------------------------- erişim kapsamı */

export type AccessScopeRow = {
  resource: string;
  departmentId: string | null;
  divisionId: string | null;
  isPrimary: boolean;
};

export const PERMISSION_RESOURCE_LABELS: Record<string, string> = {
  tenants: 'Kiracı / Kurum',
  users: 'Kullanıcılar',
  roles: 'Roller',
  departments: 'Departmanlar',
  divisions: 'Bölümler',
  companies: 'Firmalar / Cari Kart',
  contacts: 'Kontaklar',
  leads: 'Fırsatlar',
  lead_assignment_rules: 'Fırsat Atama Kuralları',
  opportunities: 'Satış Kartları',
  activities: 'Aktiviteler',
  calendar: 'Takvim',
  competitors: 'Rakipler',
  brands: 'Markalar / Referanslar',
  products: 'Ürünler',
  product_specs: 'Ürün Özellikleri',
  price_lists: 'Fiyat Listeleri',
  warehouses: 'Depolar',
  inventory: 'Stok',
  customer_devices: 'Müşteri Cihazları',
  quotes: 'Teklifler',
  sales_orders: 'Satış Siparişleri',
  proformas: 'Proformalar',
  contracts: 'Sözleşmeler',
  commercial_invoices: 'Ticari Faturalar',
  accounting_invoices: 'Muhasebe Faturaları',
  purchase_orders: 'Satın Alma',
  shipments: 'Sevkiyat / Teslimat',
  installations: 'Kurulumlar',
  service_tickets: 'Servis Talepleri',
  receivables: 'Cari Rapor / Alacaklar',
  payments: 'Ödemeler',
  files: 'Dokümanlar',
  reports: 'Raporlar',
  meta: 'Meta Merkezi',
  meta_campaigns: 'Meta Kampanyaları',
  meta_messages: 'Meta Mesajları',
  meta_audiences: 'Meta Hedef Kitleleri',
  meta_catalogs: 'Meta Katalogları',
  audit: 'Denetim Kayıtları',
};

export const resourceLabel = (resource: string) => PERMISSION_RESOURCE_LABELS[resource] ?? resource;

/** Kayıtlı kapsam yoksa her kaynak için birincil departman/bölümle varsayılan satır. */
export function initialAccessScopes(
  resources: readonly string[],
  existing: AccessScopeRow[],
  departmentId: string | null,
  divisionIds: string[]
): AccessScopeRow[] {
  if (existing.length) return existing.map((scope) => ({ ...scope }));
  return resources.map((resource) => ({
    resource,
    departmentId,
    divisionId: divisionIds[0] ?? null,
    isPrimary: true,
  }));
}

/** Birincil departman değişince ona bağlı kapsamlar birlikte taşınır; "Tümü" veya başka departmanlar korunur. */
export function moveScopesToDepartment(rows: AccessScopeRow[], previous: string | null, next: string | null) {
  if (!previous) return rows;
  return rows.map((scope) => (scope.departmentId === previous ? { ...scope, departmentId: next } : scope));
}

/** Aynı kaynakta tek birincil kapsam olur. */
export function updateScopeRow(rows: AccessScopeRow[], index: number, patch: Partial<AccessScopeRow>) {
  const currentResource = patch.resource ?? rows[index]?.resource;
  return rows.map((row, rowIndex) => {
    if (rowIndex === index) return { ...row, ...patch };
    if (patch.isPrimary === true && row.resource === currentResource) return { ...row, isPrimary: false };
    return row;
  });
}

/* ---------------------------------------------------------------------- roller */

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'export';
export const PERMISSION_ACTIONS: PermissionAction[] = ['read', 'create', 'update', 'delete', 'approve', 'reject', 'export'];

export const ACTION_LABEL: Record<PermissionAction, string> = {
  read: 'Oku',
  create: 'Ekle',
  update: 'Düzenle',
  delete: 'Sil',
  approve: 'Onay',
  reject: 'Ret',
  export: 'Dışa Aktar',
};

export const ROLE_RESOURCE_LABEL: Record<string, string> = {
  tenants: 'Tenant',
  users: 'Kullanıcılar',
  roles: 'Roller',
  departments: 'Departmanlar',
  companies: 'Firmalar',
  contacts: 'Kontaklar',
  leads: 'Fırsatlar',
  opportunities: 'Fırsatlar',
  activities: 'Aktiviteler',
  competitors: 'Rakipler',
  brands: 'Markalar',
  products: 'Ürünler',
  trade_fairs: 'Fuar',
  product_specs: 'Ürün Özellikleri',
  price_lists: 'Fiyat Listeleri',
  warehouses: 'Depolar',
  inventory: 'Stok',
  customer_devices: 'Müşteri Cihazları',
  quotes: 'Teklifler',
  sales_orders: 'Satış Siparişleri',
  proformas: 'Proformalar',
  contracts: 'Sözleşmeler',
  commercial_invoices: 'Ticari Faturalar',
  accounting_invoices: 'Muhasebe Faturaları',
  purchase_orders: 'Satın Alma',
  shipments: 'Sevkiyat',
  installations: 'Kurulumlar',
  service_tickets: 'Servis Talepleri',
  receivables: 'Cari',
  payments: 'Ödemeler',
  files: 'Dosyalar',
  reports: 'Raporlar',
  audit: 'Denetim Kayıtları',
};

export const roleResourceLabel = (resource: string) => ROLE_RESOURCE_LABEL[resource] ?? resource;

/** Fuar alanı bütün departmanlara açık; yeni rol bu izinlerle işaretli başlar. */
export const NEW_ROLE_DEFAULT_CODES = ['trade_fairs.create', 'trade_fairs.read', 'trade_fairs.update'];

export type RoleTemplate = 'readonly' | 'operator' | 'approver';
export const ROLE_TEMPLATES: { value: RoleTemplate; label: string; actions: PermissionAction[] }[] = [
  { value: 'readonly', label: 'Salt Okuma', actions: ['read', 'export'] },
  { value: 'operator', label: 'Operasyon', actions: ['read', 'create', 'update', 'export'] },
  { value: 'approver', label: 'Onaylayıcı', actions: ['read', 'update', 'approve', 'reject', 'export'] },
];

type PermissionLike = { code: string; resource: string; action: string };

export const roleCodeFromName = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

export const sameCodes = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((code) => set.has(code));
};

export function applyRoleTemplate(permissions: PermissionLike[], template: RoleTemplate): string[] {
  const actions = ROLE_TEMPLATES.find((item) => item.value === template)?.actions ?? [];
  return permissions
    .filter((permission) => (actions as string[]).includes(permission.action))
    .map((permission) => permission.code)
    .sort();
}

export function buildPermissionRows<P extends PermissionLike>(permissions: P[]) {
  const map = new Map<string, Partial<Record<PermissionAction, P>>>();
  for (const permission of permissions) {
    if (!map.has(permission.resource)) map.set(permission.resource, {});
    map.get(permission.resource)![permission.action as PermissionAction] = permission;
  }
  return Array.from(map.entries())
    .map(([resource, actions]) => ({ resource, actions }))
    .sort((a, b) => roleResourceLabel(a.resource).localeCompare(roleResourceLabel(b.resource), 'tr'));
}

export const togglePermission = (current: string[], code: string) =>
  current.includes(code) ? current.filter((item) => item !== code) : [...current, code].sort();

/** Grup seçimi: hepsi seçiliyse hepsini kaldırır, değilse eksikleri ekler. */
export function toggleGroup(current: string[], codes: string[]) {
  if (!codes.length) return current;
  const selected = new Set(current);
  const allSelected = codes.every((code) => selected.has(code));
  if (allSelected) codes.forEach((code) => selected.delete(code));
  else codes.forEach((code) => selected.add(code));
  return [...selected].sort();
}

export type GroupState = 'all' | 'some' | 'none';
export function groupState(selected: Set<string>, codes: string[]): GroupState {
  if (!codes.length) return 'none';
  const count = codes.filter((code) => selected.has(code)).length;
  return count === 0 ? 'none' : count === codes.length ? 'all' : 'some';
}

export function effectiveActionCounts(permissions: PermissionLike[], codes: string[]) {
  const selected = new Set(codes);
  return PERMISSION_ACTIONS.reduce(
    (result, action) => {
      result[action] = permissions.filter((p) => p.action === action && selected.has(p.code)).length;
      return result;
    },
    {} as Record<PermissionAction, number>
  );
}

export function moduleCount(permissions: PermissionLike[], codes: string[]) {
  const byCode = new Map(permissions.map((permission) => [permission.code, permission.resource]));
  return new Set(codes.map((code) => byCode.get(code)).filter(Boolean)).size;
}

/** Sistem rolleri önce, sonra ada göre (web `load` sıralaması). */
export function sortRoles<R extends { name: string; isSystemRole?: boolean }>(roles: R[]) {
  return [...roles].sort((a, b) => {
    if (!!b.isSystemRole !== !!a.isSystemRole) return Number(!!b.isSystemRole) - Number(!!a.isSystemRole);
    return a.name.localeCompare(b.name, 'tr');
  });
}

/* ------------------------------------------------------------------ departman */

export const normalizeDepartmentCode = (value: string) =>
  value
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

export function filterByText<T>(rows: T[], query: string, fields: (row: T) => (string | null | undefined)[]) {
  const term = query.trim().toLocaleLowerCase('tr-TR');
  if (!term) return rows;
  return rows.filter((row) =>
    fields(row)
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('tr-TR').includes(term))
  );
}
