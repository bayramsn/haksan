import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Switch } from "../../ui/switch";
import { Checkbox } from "../../ui/checkbox";
import { Label } from "../../ui/label";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Skeleton } from "../../ui/skeleton";
import { CreateUserDialog, UserDepartmentDialog, UserEditDialog, type UserAccessScopeRow } from "../../admin/UserAdminDialogs";
import {
  TARGET_TYPE_ORDER, TargetDialog, TargetPill, currentPeriod, hasTargetValue, targetFilledCount, targetFromApi, targetToApi, targetTotalCount,
  type UserTarget,
} from "../../admin/TargetDialog";
import { useStore } from "../../../lib/store";
import { useAuth } from "../../../../lib/auth";
import { adminService, lookupService } from "../../../../lib/services";
import type { User } from "../../../lib/mock";
import { PERMISSION_RESOURCES, type PermissionResource } from "@haksan/shared";
import { InsightStat } from "../../shared/PremiumPrimitives";
import {
  AlertTriangle, Building2, LockKeyhole, Pencil, Plus, RotateCcw,
  Search, Settings, ShieldCheck, Trash2, TrendingUp, Unlock, UserCheck, UserRoundX, UsersRound,
} from "lucide-react";
import { toast } from "sonner";

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
};
const isUserLocked = (user: { lockedUntil?: string | Date | null }) => {
  if (!user.lockedUntil) return false;
  const date = user.lockedUntil instanceof Date ? user.lockedUntil : new Date(user.lockedUntil);
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now();
};

type AssignableRole = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystemRole?: boolean;
};

type AdminUserRow = User & {
  /** Girişte e-posta yerine kullanılabilen kullanıcı adı; atanmamışsa null. */
  username?: string | null;
  roleCodes: string[];
  roleNames: string[];
  departmentId?: string | null;
  titleId?: string | null;
  titleName?: string | null;
  divisionIds: string[];
  divisionNames: string[];
  accessScopes: UserAccessScopeRow[];
  failedLoginAttempts: number;
  lockedUntil?: string | null;
};

const FALLBACK_ROLE_CODES: Record<string, string> = {
  SuperAdmin: "super_admin",
  Admin: "admin",
  Sales: "sales",
  Service: "service",
};
const isPermissionResource = (value: string): value is PermissionResource =>
  (PERMISSION_RESOURCES as readonly string[]).includes(value);
const TARGET_LABELS: Record<string, string> = {
  sales: "Satış",
  service: "Servis",
  finance: "Finans",
  purchase: "Satınalma",
  operations: "Operasyon",
  logistics: "Lojistik",
  other: "Diğer",
};

const normalizeStoreUser = (user: User): AdminUserRow => ({
  ...user,
  roleCodes: [FALLBACK_ROLE_CODES[user.role] ?? user.role],
  roleNames: [user.role],
  divisionIds: [],
  divisionNames: [],
  accessScopes: [],
  failedLoginAttempts: 0,
  lockedUntil: null,
});

const normalizeAdminUser = (user: any, fallback?: User): AdminUserRow => {
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const roleCodes = roles.map((role: any) => String(role?.code ?? "")).filter(Boolean);
  const roleNames = roles.map((role: any) => String(role?.name ?? role?.code ?? "")).filter(Boolean);
  const divisionRows = Array.isArray(user.divisions) ? user.divisions : [];
  const divisionIds = divisionRows.map((d: any) => String(d?.id ?? "")).filter(Boolean);
  const divisionNames = divisionRows.map((d: any) => String(d?.name ?? d?.code ?? "")).filter(Boolean);
  const accessScopes = Array.isArray(user.accessScopes)
    ? user.accessScopes.map((scope: any) => ({
        resource: String(scope.resource ?? ""),
        departmentId: scope.departmentId ?? null,
        divisionId: scope.divisionId ?? null,
        isPrimary: Boolean(scope.isPrimary),
      })).filter((scope: { resource: string }): scope is UserAccessScopeRow => isPermissionResource(scope.resource))
    : [];
  const fallbackRole = fallback?.role ?? "Admin";

  return {
    id: user.id,
    name: user.fullName ?? user.name ?? fallback?.name ?? user.email ?? "—",
    email: user.email ?? fallback?.email ?? "",
    username: user.username ?? null,
    phone: user.phone ?? fallback?.phone ?? null,
    role: ((roleNames[0] ?? fallbackRole) as User["role"]) || fallbackRole,
    department: user.department?.name ?? fallback?.department ?? "",
    departmentId: user.departmentId ?? user.department?.id ?? fallback?.departmentId ?? null,
    titleId: user.titleId ?? user.title?.id ?? null,
    titleName: user.title?.name ?? null,
    active: user.status ? user.status !== "passive" : fallback?.active ?? true,
    avatarUrl: user.avatarUrl ?? user.photoUrl ?? fallback?.avatarUrl,
    purchaseApprovalLimit: user.purchaseApprovalLimit ? Number(user.purchaseApprovalLimit) : fallback?.purchaseApprovalLimit,
    managerId: user.managerId ?? fallback?.managerId,
    roleCodes: roleCodes.length ? roleCodes : [FALLBACK_ROLE_CODES[fallbackRole] ?? fallbackRole],
    roleNames: roleNames.length ? roleNames : [fallbackRole],
    divisionIds,
    divisionNames,
    accessScopes,
    failedLoginAttempts: Number(user.failedLoginAttempts ?? (fallback as Partial<AdminUserRow> | undefined)?.failedLoginAttempts ?? 0),
    lockedUntil: user.lockedUntil ?? (fallback as Partial<AdminUserRow> | undefined)?.lockedUntil ?? null,
  };
};

export function UsersPage() {
  const { users, refresh } = useStore();
  const { hasRole, hasPermission, user: currentUser } = useAuth();
  // Hedef oluşturma süper admin (ve admin) yetkisine bağlı.
  const canSetTargets = hasRole("super_admin") || hasRole("admin");
  const canAssignRoles = hasRole("super_admin") || hasPermission("users.update");
  const canCreateUser = hasRole("super_admin") || hasPermission("users.create");
  const canUpdateUser = hasRole("super_admin") || hasPermission("users.update");
  const canDeleteUser = hasRole("super_admin") || hasPermission("users.delete");
  // Ad/e-posta/telefon düzenleme ve şifre sıfırlama yalnızca süper admin'e açık
  // (e-posta ve şifre değişimi backend'de super_admin gerektirir).
  const canEditUser = hasRole("super_admin");
  const canShowActions = canSetTargets || canAssignRoles || canUpdateUser || canDeleteUser || canEditUser;
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [divisions, setDivisions] = useState<{ id: string; code: string; name: string }[]>([]);
  // CRM Alan Ayarları > Kullanıcı Ünvanları listesinden beslenir.
  const [titles, setTitles] = useState<{ id: string; name: string }[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AssignableRole[]>([]);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod());
  const [targets, setTargets] = useState<Record<string, UserTarget>>({});
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [roleUser, setRoleUser] = useState<AdminUserRow | null>(null);
  const [limitUser, setLimitUser] = useState<User | null>(null);
  const [deptUser, setDeptUser] = useState<AdminUserRow | null>(null);
  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [unlockUser, setUnlockUser] = useState<AdminUserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUserRow | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);
  const [savingDept, setSavingDept] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [unlockSaving, setUnlockSaving] = useState(false);
  const [deletingSaving, setDeletingSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "passive" | "locked">("all");

  const loadAdminUsers = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const [userRows, roleRows, deptRows, divisionRows, titleRows] = await Promise.all([
        adminService.users(),
        canAssignRoles || canCreateUser ? adminService.roles() : Promise.resolve([]),
        adminService.departments().catch(() => []),
        adminService.divisions().catch(() => []),
        lookupService.byName("user-titles").catch(() => []),
      ]);
      const fallbackById = new Map(users.map((user) => [user.id, user]));
      setAdminUsers((Array.isArray(userRows) ? userRows : []).map((user) => normalizeAdminUser(user, fallbackById.get(user.id))));
      setDepartments((Array.isArray(deptRows) ? deptRows : []).map((d: any) => ({ id: d.id, name: d.name, code: d.code })));
      setDivisions((Array.isArray(divisionRows) ? divisionRows : []).map((d: any) => ({ id: d.id, code: d.code, name: d.name })));
      setTitles(
        (Array.isArray(titleRows) ? titleRows : [])
          .filter((t: any) => t?.id && t?.name && t?.isActive !== false)
          .map((t: any) => ({ id: String(t.id), name: String(t.name) }))
      );
      setAvailableRoles(
        (Array.isArray(roleRows) ? roleRows : [])
          .map((role: any) => ({
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystemRole: role.isSystemRole,
          }))
          .sort((a, b) => {
            if (!!b.isSystemRole !== !!a.isSystemRole) return Number(!!b.isSystemRole) - Number(!!a.isSystemRole);
            return a.name.localeCompare(b.name, "tr");
          })
      );
    } catch (err: any) {
      setAdminError(err?.message ?? "Kullanıcılar yüklenemedi.");
      setAdminUsers([]);
      setAvailableRoles([]);
    } finally {
      setAdminLoading(false);
    }
  }, [canAssignRoles, canCreateUser, users]);

  useEffect(() => {
    loadAdminUsers();
  }, [loadAdminUsers]);

  const displayUsers = adminUsers.length ? adminUsers : users.map(normalizeStoreUser);
  const lockedUsers = useMemo(() => displayUsers.filter(isUserLocked), [displayUsers]);
  const activeUsers = useMemo(() => displayUsers.filter((user) => user.active && !isUserLocked(user)), [displayUsers]);
  const filteredUsers = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    return displayUsers.filter((user) => {
      const matchesTerm = !term || [user.name, user.email, user.username, user.department, ...user.roleNames, ...user.divisionNames]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("tr-TR").includes(term));
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "locked" && isUserLocked(user))
        || (statusFilter === "active" && user.active && !isUserLocked(user))
        || (statusFilter === "passive" && !user.active);
      return matchesTerm && matchesStatus;
    });
  }, [displayUsers, query, statusFilter]);

  const fetchTargets = useCallback(async () => {
    if (!canSetTargets) return;
    try {
      const rows = await adminService.userTargets({ period: targetPeriod });
      const next: Record<string, UserTarget> = {};
      rows.forEach((row: any) => {
        next[row.userId] = targetFromApi(row);
      });
      setTargets(next);
    } catch (err: any) {
      toast.error("Hedefler yüklenemedi", { description: err?.message ?? "Backend isteği başarısız oldu." });
    }
  }, [canSetTargets, targetPeriod]);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  const handleSaveTarget = async (userId: string, target: UserTarget) => {
    const saved = await adminService.saveUserTarget(userId, targetToApi({ ...target, period: targetPeriod }));
    setTargets((prev) => ({ ...prev, [userId]: targetFromApi(saved) }));
  };

  const handleSaveLimit = async (
    userId: string,
    purchaseLimit: number | undefined,
    managerId: string | undefined
  ) => {
    setSavingLimit(true);
    try {
      await adminService.updateUser(userId, {
        purchaseApprovalLimit: purchaseLimit ?? 0,
        managerId: managerId ?? null,
      });
      toast.success("Kullanıcı limitleri güncellendi");
      setLimitUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Limitler güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingLimit(false);
    }
  };

  const handleSaveRoles = async (userId: string, roleCodes: string[]) => {
    setSavingRoles(true);
    try {
      await adminService.updateUser(userId, { roleCodes });
      toast.success("Roller güncellendi");
      setRoleUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Roller güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingRoles(false);
    }
  };

  const handleSaveDepartment = async (
    userId: string,
    departmentId: string | null,
    active: boolean,
    divisionIds?: string[],
    accessScopes?: UserAccessScopeRow[],
    titleId?: string | null
  ) => {
    setSavingDept(true);
    try {
      const editsDepartmentScope = divisionIds !== undefined || accessScopes !== undefined;
      await adminService.updateUser(userId, {
        // Tablo üzerindeki durum anahtarı yalnızca status gönderir; departman
        // ve özel erişim kapsamlarını farkında olmadan sıfırlamaz.
        ...(editsDepartmentScope ? { departmentId } : {}),
        ...(titleId !== undefined ? { titleId } : {}),
        status: active ? "active" : "passive",
        // Yalnızca dialogdan açıkça düzenlendiğinde gönder — durum anahtarı bölümleri silmesin.
        ...(divisionIds ? { divisionIds } : {}),
        ...(accessScopes ? { accessScopes } : {}),
      });
      toast.success("Kullanıcı güncellendi");
      setDeptUser(null);
      await loadAdminUsers();
      // Belge çıktıları proje ilgilisinin ünvanını ortak kullanıcı listesinden
      // de okuyabildiği için aynı oturumdaki eski değeri hemen temizle.
      await refresh();
    } catch (err: any) {
      toast.error("Güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingDept(false);
    }
  };

  const handleSaveEdit = async (
    userId: string,
    patch: { fullName: string; email: string; username: string; phone: string | null; password?: string }
  ) => {
    setSavingEdit(true);
    try {
      await adminService.updateUser(userId, patch);
      toast.success(patch.password ? "Kullanıcı bilgileri ve şifre güncellendi" : "Kullanıcı bilgileri güncellendi");
      setEditUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Kullanıcı güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleUnlockUser = async () => {
    if (!unlockUser) return;
    setUnlockSaving(true);
    try {
      await adminService.unlockUser(unlockUser.id);
      toast.success("Hesap kilidi kaldırıldı");
      setUnlockUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Hesap kilidi kaldırılamadı", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setUnlockSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setDeletingSaving(true);
    try {
      await adminService.deleteUser(deletingUser.id);
      toast.success("Kullanıcı silindi");
      setDeletingUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Kullanıcı silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setDeletingSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="premium-blueprint precision-corners overflow-hidden rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-primary">ERİŞİM ENVANTERİ</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Kullanıcı kimlikleri</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Kimlik, organizasyon kapsamı, roller ve hesap güvenliğini birlikte yönetin.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[480px]">
            <InsightStat label="Toplam" value={displayUsers.length} icon={<UsersRound />} />
            <InsightStat label="Aktif" value={activeUsers.length} icon={<UserCheck />} tone="success" />
            <InsightStat label="Kilitli" value={lockedUsers.length} icon={<LockKeyhole />} tone={lockedUsers.length ? "warning" : "success"} />
          </div>
        </div>
      </section>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="gap-4 border-b border-border/60 bg-muted/10 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="text-base">Erişim kayıtları</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{filteredUsers.length} / {displayUsers.length} kullanıcı gösteriliyor</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-[270px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, e-posta, rol veya ekip ara..." className="h-9 bg-card pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="h-9 w-full bg-card sm:w-[135px]" aria-label="Hesap durumu filtresi"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm durumlar</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="passive">Pasif</SelectItem>
                  <SelectItem value="locked">Kilitli</SelectItem>
                </SelectContent>
              </Select>
            {canSetTargets && (
              <Input
                type="month"
                className="h-9 w-full sm:w-[150px]"
                value={targetPeriod}
                onChange={(e) => setTargetPeriod(e.target.value || currentPeriod())}
              />
            )}
            {canCreateUser && (
              <Button className="gap-1" onClick={() => setCreateUserOpen(true)}><Plus className="size-4" /> Kullanıcı Ekle</Button>
            )}
            </div>
          </div>
        </CardHeader>
        {adminError && (
          <div className="mx-4 mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {adminError}
          </div>
        )}
        {canUpdateUser && (
          <div className={`mx-4 mb-4 mt-4 rounded-lg border p-3 text-sm ${lockedUsers.length ? "border-warning/30 bg-warning/5" : "border-success/25 bg-success/5"}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className={`flex items-center gap-2 font-medium ${lockedUsers.length ? "text-warning" : "text-success"}`}>
                {lockedUsers.length ? <LockKeyhole className="size-4" /> : <ShieldCheck className="size-4" />}
                <span>{lockedUsers.length ? "Kilitli hesap müdahalesi gerekiyor" : "Hesap güvenliği normal"}</span>
                <Badge variant="outline" className="bg-card/70">{lockedUsers.length}</Badge>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1 bg-card/70" onClick={() => void loadAdminUsers()} disabled={adminLoading}>
                <RotateCcw className="size-3.5" /> Yenile
              </Button>
            </div>
            {lockedUsers.length > 0 && (
              <div className="mt-3 grid gap-2">
                {lockedUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-col gap-3 rounded-md border border-warning/25 bg-card/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{user.name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</div>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <div className="text-xs text-muted-foreground">
                        {user.failedLoginAttempts} hatalı deneme · {formatDateTime(user.lockedUntil)} tarihine kadar
                      </div>
                      <Button size="sm" className="h-8 gap-1" onClick={() => setUnlockUser(user)}>
                        <Unlock className="size-3.5" /> Kilidi Aç
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kullanıcı Kimliği</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Departman</TableHead>
                <TableHead>Bölüm</TableHead>
                <TableHead>Hedef</TableHead>
                <TableHead>Limitler (USD)</TableHead>
                <TableHead>Yönetici</TableHead>
                <TableHead>Durum</TableHead>
                {canShowActions && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminLoading && displayUsers.length === 0 ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={`users-loading-${index}`}>
                    {Array.from({ length: canShowActions ? 9 : 8 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredUsers.map((u) => {
                const t = targets[u.id];
                const targetSummaries = t
                  ? TARGET_TYPE_ORDER.map((targetType) => ({
                      targetType,
                      filled: targetFilledCount(t, targetType),
                      total: targetTotalCount(targetType),
                    })).filter((summary) => summary.filled > 0)
                  : [];
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex min-w-[220px] items-center gap-3">
                        <div className="relative shrink-0">
                          <Avatar className="size-9 border border-border/70">
                            {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{u.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card ${isUserLocked(u) ? "bg-warning" : u.active ? "bg-success" : "bg-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{u.name}</span>
                            {isUserLocked(u) && <LockKeyhole className="size-3.5 shrink-0 text-warning" aria-label="Hesap kilitli" />}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {u.email}
                            {u.username ? <span className="text-muted-foreground/70"> · @{u.username}</span> : null}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {u.roleNames.map((role) => (
                          <Badge key={role} variant="secondary">{role}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canUpdateUser ? (
                        <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setDeptUser(u)}>
                          <Badge variant="outline" className="font-normal">{u.department || "Atanmadı"}</Badge>
                        </Button>
                      ) : (
                        u.department || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {u.divisionNames.length > 0 ? (
                        <div className="flex max-w-[200px] flex-wrap gap-1">
                          {u.divisionNames.map((d, i) => (
                            <Badge key={d} variant={i === 0 ? "default" : "outline"} className="text-[10px]">{d}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasTargetValue(t) && targetSummaries.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {targetSummaries.slice(0, 4).map((summary) => (
                            <TargetPill
                              key={summary.targetType}
                              label={TARGET_LABELS[summary.targetType] ?? summary.targetType}
                              value={`${summary.filled}/${summary.total}`}
                            />
                          ))}
                          {targetSummaries.length > 4 && <TargetPill label="+" value={String(targetSummaries.length - 4)} />}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[132px] space-y-0.5 text-xs">
                        <div>
                          <span className="text-muted-foreground">Onay:</span>{" "}
                          {u.purchaseApprovalLimit
                            ? `$${u.purchaseApprovalLimit.toLocaleString("tr-TR")}`
                            : <span className="text-muted-foreground">Limitsiz</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.managerId ? displayUsers.find((x) => x.id === u.managerId)?.name : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[86px] items-center gap-2">
                        <Switch checked={u.active} disabled={!canUpdateUser} onCheckedChange={canUpdateUser ? (checked) => void handleSaveDepartment(u.id, u.departmentId ?? null, checked) : undefined} aria-label={`${u.name} hesabını ${u.active ? "pasif" : "aktif"} yap`} />
                        <span className={`text-xs font-medium ${u.active ? "text-success" : "text-muted-foreground"}`}>{u.active ? "Aktif" : "Pasif"}</span>
                      </div>
                    </TableCell>
                    {canShowActions && (
                      <TableCell className="text-right whitespace-nowrap">
                        {canEditUser && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditUser(u)}>
                            <Pencil className="size-3.5" /> Düzenle
                          </Button>
                        )}
                        {canUpdateUser && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setDeptUser(u)}>
                            <Building2 className="size-3.5" /> Departman
                          </Button>
                        )}
                        {canAssignRoles && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setRoleUser(u)}>
                            <ShieldCheck className="size-3.5" /> Rol Ata
                          </Button>
                        )}
                        {canSetTargets && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setTargetUser(u)}>
                              <TrendingUp className="size-3.5" /> Hedef
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setLimitUser(u)}>
                              <Settings className="size-3.5" /> Limit
                            </Button>
                          </>
                        )}
                        {canUpdateUser && isUserLocked(u) && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setUnlockUser(u)}>
                            <Unlock className="size-3.5" /> Kilidi Aç
                          </Button>
                        )}
                        {canDeleteUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs text-red-600 hover:text-red-600"
                            disabled={currentUser?.id === u.id}
                            title={currentUser?.id === u.id ? "Kendi hesabınızı silemezsiniz" : "Kullanıcıyı sil"}
                            onClick={() => setDeletingUser(u)}
                          >
                            <Trash2 className="size-3.5" /> Sil
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {!adminLoading && filteredUsers.length === 0 && (
                <TableRow><TableCell colSpan={canShowActions ? 9 : 8} className="py-10 text-center"><UserRoundX className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Eşleşen kullanıcı yok</p><p className="mt-1 text-xs text-muted-foreground">Arama metnini veya durum filtresini değiştirin.</p></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {canSetTargets && (
        <TargetDialog
          scope={targetUser ? { kind: "user", id: targetUser.id, name: targetUser.name, subtitle: targetUser.email } : null}
          target={targetUser ? targets[targetUser.id] : undefined}
          period={targetPeriod}
          onClose={() => setTargetUser(null)}
          onSave={(scope, target) => handleSaveTarget(scope.id, target)}
        />
      )}
      {canAssignRoles && (
        <UserRoleDialog
          user={roleUser}
          roles={availableRoles}
          saving={savingRoles}
          onClose={() => setRoleUser(null)}
          onSave={handleSaveRoles}
        />
      )}
      {canSetTargets && (
        <UserLimitDialog
          user={limitUser}
          users={displayUsers}
          saving={savingLimit}
          onClose={() => setLimitUser(null)}
          onSave={handleSaveLimit}
        />
      )}
      {canEditUser && (
        <UserEditDialog
          user={editUser}
          saving={savingEdit}
          onClose={() => setEditUser(null)}
          onSave={handleSaveEdit}
        />
      )}
      {canUpdateUser && (
        <UserDepartmentDialog
          user={deptUser}
          departments={departments}
          divisions={divisions}
          titles={titles}
          saving={savingDept}
          onClose={() => setDeptUser(null)}
          onSave={handleSaveDepartment}
        />
      )}
      {canCreateUser && (
        <CreateUserDialog
          open={createUserOpen}
          onOpenChange={setCreateUserOpen}
          departments={departments}
          roles={availableRoles}
          divisions={divisions}
          titles={titles}
          onCreated={loadAdminUsers}
        />
      )}
      {canUpdateUser && (
        <AlertDialog open={!!unlockUser} onOpenChange={(open) => !open && setUnlockUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hesap kilidini aç?</AlertDialogTitle>
              <AlertDialogDescription>
                <b>{unlockUser?.name}</b> için geçici giriş kilidi kaldırılacak ve hatalı giriş sayacı sıfırlanacak.
                Kullanıcı pasifse pasif kalır; şifre değişmez.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={unlockSaving}>Vazgeç</AlertDialogCancel>
              <AlertDialogAction
                disabled={unlockSaving}
                onClick={(event) => {
                  event.preventDefault();
                  void handleUnlockUser();
                }}
              >
                {unlockSaving ? "Açılıyor..." : "Kilidi Aç"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {canDeleteUser && (
        <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kullanıcıyı sil?</AlertDialogTitle>
              <AlertDialogDescription>
                <b>{deletingUser?.name}</b> kullanıcı listesinden kaldırılacak, giriş yapamayacak ve aktif oturumları kapatılacak.
                Geçmiş kayıtlar korunur.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingSaving}>Vazgeç</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={deletingSaving}
                onClick={(event) => {
                  event.preventDefault();
                  void handleDeleteUser();
                }}
              >
                {deletingSaving ? "Siliniyor..." : "Sil"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
function UserRoleDialog({ user, roles, saving, onClose, onSave }: {
  user: AdminUserRow | null;
  roles: AssignableRole[];
  saving: boolean;
  onClose: () => void;
  onSave: (userId: string, roleCodes: string[]) => Promise<void>;
}) {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  useEffect(() => {
    if (user) setSelectedCodes(user.roleCodes);
  }, [user]);

  if (!user) return null;

  const toggleRole = (code: string, checked: boolean) => {
    setSelectedCodes((current) =>
      checked ? [...new Set([...current, code])].sort() : current.filter((item) => item !== code)
    );
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave(user.id, selectedCodes);
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rol Ata · {user.name}</DialogTitle>
          <DialogDescription>Kullanıcının erişim rollerini seçin. Kaydettiğinizde roller mevcut seçimle değiştirilir.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
            <div className="font-medium">{user.email}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {user.roleNames.map((role) => <Badge key={role} variant="outline">{role}</Badge>)}
            </div>
          </div>
          {roles.length === 0 ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Rol listesi yüklenemedi</AlertTitle>
              <AlertDescription>Rol ataması yapabilmek için rol okuma yetkisi veya bağlantı gerekir.</AlertDescription>
            </Alert>
          ) : (
            <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
              {roles.map((role) => {
                const checked = selectedCodes.includes(role.code);
                return (
                  <label
                    key={role.id}
                    htmlFor={`assign-role-${role.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 p-3 transition-colors hover:bg-muted/40"
                  >
                    <Checkbox
                      id={`assign-role-${role.id}`}
                      checked={checked}
                      onCheckedChange={(value) => toggleRole(role.code, value === true)}
                      disabled={saving}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium leading-none">{role.name}</span>
                        {role.isSystemRole && <Badge variant="secondary" className="text-[10px]">Sistem</Badge>}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{role.description || role.code}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button type="submit" disabled={saving || roles.length === 0}>
              {saving ? "Kaydediliyor..." : "Rolleri Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserLimitDialog({ user, users, saving, onClose, onSave }: {
  user: User | null;
  users: User[];
  saving: boolean;
  onClose: () => void;
  onSave: (
    userId: string,
    purchaseLimit: number | undefined,
    managerId: string | undefined
  ) => Promise<void>;
}) {
  const [limit, setLimit] = useState<string>(user?.purchaseApprovalLimit?.toString() || "");
  const [managerId, setManagerId] = useState<string>(user?.managerId || "none");

  useEffect(() => {
    if (user) {
      setLimit(user.purchaseApprovalLimit?.toString() || "");
      setManagerId(user.managerId || "none");
    }
  }, [user]);

  if (!user) return null;

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Kullanıcı Limitleri · {user.name}</DialogTitle>
          <DialogDescription>Satınalma onay yetkisini ve bağlı yöneticiyi ayarlayın.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Satınalma Onay Limiti (USD)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="Limitsiz için boş bırakın"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Limit aşıldığında sipariş seçilen yöneticinin onayına düşer.</p>
          </div>
          <div className="space-y-2">
            <Label>Bağlı Olduğu Yönetici</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger>
                <SelectValue placeholder="Yönetici Seçin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Yok (Doğrudan Onaylar)</SelectItem>
                {users.filter(u => u.id !== user.id).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              await onSave(
                user.id,
                limit ? Number(limit) : undefined,
                managerId === "none" ? undefined : managerId
              );
            }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
