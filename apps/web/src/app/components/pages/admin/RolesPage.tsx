import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Textarea } from "../../ui/textarea";
import { Checkbox } from "../../ui/checkbox";
import { Label } from "../../ui/label";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Skeleton } from "../../ui/skeleton";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import { TargetDialog, currentPeriod, targetToApi, type TargetScope, type UserTarget } from "../../admin/TargetDialog";
import { BookOpenCheck, Plus, Search, ShieldCheck, Lock, Save, X, RotateCcw, AlertTriangle, TrendingUp, Workflow } from "lucide-react";
import { toast } from "sonner";

type PermissionAction = "read" | "create" | "update" | "delete" | "approve" | "reject" | "export";
type PermissionDto = {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: PermissionAction;
  description?: string | null;
};
type RoleDto = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystemRole?: boolean;
  permissions: Array<{ code: string; name: string }>;
};

const PERMISSION_ACTIONS: PermissionAction[] = ["read", "create", "update", "delete", "approve", "reject", "export"];
const ACTION_LABEL: Record<PermissionAction, string> = {
  read: "Oku",
  create: "Ekle",
  update: "Düzenle",
  delete: "Sil",
  approve: "Onay",
  reject: "Ret",
  export: "Dışa Aktar",
};
const RESOURCE_LABEL: Record<string, string> = {
  tenants: "Tenant",
  users: "Kullanıcılar",
  roles: "Roller",
  departments: "Departmanlar",
  companies: "Firmalar",
  contacts: "Kontaklar",
  leads: "Lead",
  opportunities: "Fırsatlar",
  activities: "Aktiviteler",
  competitors: "Rakipler",
  brands: "Markalar",
  products: "Ürünler",
  product_specs: "Ürün Özellikleri",
  price_lists: "Fiyat Listeleri",
  warehouses: "Depolar",
  inventory: "Stok",
  customer_devices: "Müşteri Cihazları",
  quotes: "Teklifler",
  sales_orders: "Satış Siparişleri",
  proformas: "Proformalar",
  contracts: "Sözleşmeler",
  commercial_invoices: "Ticari Faturalar",
  accounting_invoices: "Muhasebe Faturaları",
  purchase_orders: "Satın Alma",
  shipments: "Sevkiyat",
  installations: "Kurulumlar",
  service_tickets: "Servis Talepleri",
  receivables: "Cari",
  payments: "Ödemeler",
  files: "Dosyalar",
  reports: "Raporlar",
  audit: "Denetim Kayıtları",
};

const roleCodeFromName = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

const sameCodes = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((code) => set.has(code));
};

const buildPermissionRows = (permissions: PermissionDto[]) => {
  const map = new Map<string, Partial<Record<PermissionAction, PermissionDto>>>();
  for (const permission of permissions) {
    if (!map.has(permission.resource)) map.set(permission.resource, {});
    map.get(permission.resource)![permission.action] = permission;
  }
  return Array.from(map.entries())
    .map(([resource, actions]) => ({ resource, actions }))
    .sort((a, b) => (RESOURCE_LABEL[a.resource] ?? a.resource).localeCompare(RESOURCE_LABEL[b.resource] ?? b.resource, "tr"));
};

function PermissionMatrix({
  permissions,
  selectedCodes,
  editable,
  onToggle,
  maxHeight = "max-h-[620px]",
}: {
  permissions: PermissionDto[];
  selectedCodes: Set<string>;
  editable: boolean;
  onToggle: (code: string) => void;
  maxHeight?: string;
}) {
  const rows = useMemo(() => buildPermissionRows(permissions), [permissions]);
  const allCodes = permissions.map((permission) => permission.code);
  const toggleGroup = (codes: string[]) => {
    if (!editable || codes.length === 0) return;
    const allSelected = codes.every((code) => selectedCodes.has(code));
    codes.forEach((code) => {
      if (allSelected ? selectedCodes.has(code) : !selectedCodes.has(code)) onToggle(code);
    });
  };
  return (
    <div className={`overflow-auto rounded-lg border border-border/60 bg-card ${maxHeight}`}>
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur">
          <tr className="border-b border-border/60">
            <th className="sticky left-0 z-30 w-[250px] border-r border-border/60 bg-muted px-3 py-2.5 text-left">
              <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Checkbox
                  checked={allCodes.every((code) => selectedCodes.has(code)) ? true : allCodes.some((code) => selectedCodes.has(code)) ? "indeterminate" : false}
                  disabled={!editable}
                  onCheckedChange={() => toggleGroup(allCodes)}
                  aria-label="Tüm yetkileri seç"
                />
                Modül
              </label>
            </th>
            {PERMISSION_ACTIONS.map((action) => {
              const actionCodes = permissions.filter((permission) => permission.action === action).map((permission) => permission.code);
              return (
                <th key={action} className="px-2 py-2 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
                  <label className="flex cursor-pointer flex-col items-center gap-1">
                    <Checkbox
                      checked={actionCodes.every((code) => selectedCodes.has(code)) ? true : actionCodes.some((code) => selectedCodes.has(code)) ? "indeterminate" : false}
                      disabled={!editable || actionCodes.length === 0}
                      onCheckedChange={() => toggleGroup(actionCodes)}
                      aria-label={`Tüm ${ACTION_LABEL[action]} yetkilerini seç`}
                    />
                    <span>{ACTION_LABEL[action]}</span>
                  </label>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowCodes = Object.values(row.actions).filter(Boolean).map((permission) => permission!.code);
            return (
            <tr key={row.resource} className="group border-b border-border/40 last:border-0 hover:bg-muted/25">
              <td className="sticky left-0 z-10 border-r border-border/50 bg-card px-3 py-2.5 group-hover:bg-muted">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    checked={rowCodes.every((code) => selectedCodes.has(code)) ? true : rowCodes.some((code) => selectedCodes.has(code)) ? "indeterminate" : false}
                    disabled={!editable}
                    onCheckedChange={() => toggleGroup(rowCodes)}
                    aria-label={`${RESOURCE_LABEL[row.resource] ?? row.resource} modülünün tüm yetkilerini seç`}
                  />
                  <div>
                    <div className="font-medium leading-tight">{RESOURCE_LABEL[row.resource] ?? row.resource}</div>
                    <div className="mt-0.5 font-data text-[10px] text-muted-foreground">{row.resource}</div>
                  </div>
                </div>
              </td>
              {PERMISSION_ACTIONS.map((action) => {
                const permission = row.actions[action];
                const checked = !!permission && selectedCodes.has(permission.code);
                return (
                  <td key={action} className="px-2 py-2.5 text-center">
                    {permission ? (
                      <Checkbox
                        checked={checked}
                        disabled={!editable}
                        onCheckedChange={() => onToggle(permission.code)}
                        aria-label={`${RESOURCE_LABEL[row.resource] ?? row.resource} ${ACTION_LABEL[action]}`}
                        className="mx-auto"
                      />
                    ) : (
                      <span className="mx-auto block h-px w-5 bg-border/70" />
                    )}
                  </td>
                );
              })}
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  );
}

export function RolesPage() {
  const { hasRole } = useAuth();
  const canManageRoles = hasRole("super_admin");
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [permissions, setPermissions] = useState<PermissionDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCodes, setDraftCodes] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", code: "", description: "", permissionCodes: [] as string[] });
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod());
  const [targetScope, setTargetScope] = useState<TargetScope | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);

  const load = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [roleRows, permissionRows] = await Promise.all([adminService.roles(), adminService.permissions()]);
      const normalizedRoles = (roleRows as RoleDto[]).sort((a, b) => {
        if (!!b.isSystemRole !== !!a.isSystemRole) return Number(!!b.isSystemRole) - Number(!!a.isSystemRole);
        return a.name.localeCompare(b.name, "tr");
      });
      setRoles(normalizedRoles);
      setPermissions(permissionRows as PermissionDto[]);
      const nextId = preferredId && normalizedRoles.some((role) => role.id === preferredId) ? preferredId : normalizedRoles[0]?.id ?? null;
      setSelectedId(nextId);
    } catch (err: any) {
      setError(err?.message ?? "Roller yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedRole = roles.find((role) => role.id === selectedId) ?? null;
  const selectedRolePermissionCodes = useMemo(() => selectedRole?.permissions.map((p) => p.code).sort() ?? [], [selectedRole]);

  useEffect(() => {
    if (!selectedRole) {
      setDraftName("");
      setDraftDescription("");
      setDraftCodes([]);
      return;
    }
    setDraftName(selectedRole.name);
    setDraftDescription(selectedRole.description ?? "");
    setDraftCodes(selectedRole.permissions.map((p) => p.code).sort());
  }, [selectedRole?.id, selectedRole?.name, selectedRole?.description, selectedRolePermissionCodes.join("|")]);

  const selectedCodes = useMemo(() => new Set(draftCodes), [draftCodes]);
  const roleResources = useMemo(() => {
    const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));
    return new Set(draftCodes.map((code) => permissionByCode.get(code)?.resource).filter(Boolean)).size;
  }, [draftCodes, permissions]);
  const effectiveActionCounts = useMemo(() => {
    const selected = new Set(draftCodes);
    return PERMISSION_ACTIONS.reduce((result, action) => {
      result[action] = permissions.filter((permission) => permission.action === action && selected.has(permission.code)).length;
      return result;
    }, {} as Record<PermissionAction, number>);
  }, [draftCodes, permissions]);
  const dirty =
    !!selectedRole &&
    (draftName.trim() !== selectedRole.name ||
      draftDescription.trim() !== (selectedRole.description ?? "") ||
      !sameCodes(draftCodes, selectedRolePermissionCodes));

  const filteredRoles = roles.filter((role) => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    if (!term) return true;
    return role.name.toLocaleLowerCase("tr-TR").includes(term) || role.code.toLocaleLowerCase("tr-TR").includes(term);
  });

  const toggleDraftPermission = (code: string) => {
    if (!canManageRoles) return;
    setDraftCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code].sort()
    );
  };

  const toggleNewPermission = (code: string) => {
    setNewRole((current) => ({
      ...current,
      permissionCodes: current.permissionCodes.includes(code)
        ? current.permissionCodes.filter((item) => item !== code)
        : [...current.permissionCodes, code].sort(),
    }));
  };

  const applyRoleTemplate = (template: "readonly" | "operator" | "approver") => {
    const allowedActions: PermissionAction[] = template === "readonly"
      ? ["read", "export"]
      : template === "operator"
        ? ["read", "create", "update", "export"]
        : ["read", "update", "approve", "reject", "export"];
    setNewRole((current) => ({
      ...current,
      permissionCodes: permissions.filter((permission) => allowedActions.includes(permission.action)).map((permission) => permission.code).sort(),
    }));
  };

  const resetDraft = () => {
    if (!selectedRole) return;
    setDraftName(selectedRole.name);
    setDraftDescription(selectedRole.description ?? "");
    setDraftCodes(selectedRolePermissionCodes);
  };

  const saveRole = async () => {
    if (!selectedRole || !canManageRoles) return;
    setSaving(true);
    try {
      await adminService.updateRole(selectedRole.id, {
        name: draftName.trim(),
        description: draftDescription.trim() || null,
        permissionCodes: draftCodes,
      });
      toast.success("Rol güncellendi");
      await load(selectedRole.id);
    } catch (err: any) {
      toast.error("Rol güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSaving(false);
    }
  };

  const createRole = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageRoles) return;
    const code = roleCodeFromName(newRole.code || newRole.name);
    if (!newRole.name.trim() || !code) {
      toast.error("Rol adı ve kod gerekli");
      return;
    }
    setCreating(true);
    try {
      const created = await adminService.createRole({
        code,
        name: newRole.name.trim(),
        description: newRole.description.trim() || undefined,
        permissionCodes: newRole.permissionCodes,
      });
      toast.success("Rol oluşturuldu");
      setCreateOpen(false);
      setNewRole({ name: "", code: "", description: "", permissionCodes: [] });
      await load(created.id);
    } catch (err: any) {
      toast.error("Rol oluşturulamadı", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setCreating(false);
    }
  };

  const openRoleTarget = async () => {
    if (!selectedRole || !canManageRoles) return;
    setTargetLoading(true);
    try {
      const members = await adminService.roleTargetMembers(selectedRole.id);
      setTargetScope({
        kind: "role",
        id: selectedRole.id,
        name: selectedRole.name,
        subtitle: selectedRole.code,
        memberCount: members.memberCount,
      });
    } catch (err: any) {
      toast.error("Rol üyeleri alınamadı", { description: err?.message ?? "Backend isteği başarısız oldu." });
    } finally {
      setTargetLoading(false);
    }
  };

  const saveRoleTarget = async (scope: TargetScope, target: UserTarget) => {
    await adminService.saveRoleTarget(scope.id, targetToApi({ ...target, period: targetPeriod }));
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="border-border/60 p-4 shadow-sm">
          <Skeleton className="h-9 w-full" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
          </div>
        </Card>
        <Card className="border-border/60 p-5 shadow-sm">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-3 h-16 w-full" />
          <Skeleton className="mt-5 h-[420px] w-full" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-3xl">
        <AlertTriangle />
        <AlertTitle>Roller yüklenemedi</AlertTitle>
        <AlertDescription>
          <span>{error}</span>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => load(selectedId)}>
            <RotateCcw className="size-4" /> Tekrar dene
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!roles.length) {
    return (
      <Card className="border-border/60 p-8 text-center shadow-sm">
        <div className="mx-auto grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="mt-3 text-base font-medium">Henüz rol yok</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Rol listesi boş. Süper Admin yeni rol oluşturarak başlayabilir.</p>
      </Card>
    );
  }

  return (
    <>
    <div className="crm-page grid lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="min-h-[660px] overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Roller</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{roles.length} rol · {permissions.length} yetki</p>
            </div>
            {canManageRoles && (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5">
                    <Plus className="size-4" /> Rol
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>Yeni rol oluştur</DialogTitle>
                    <DialogDescription>Rol bilgilerini ve başlangıç yetkilerini belirleyin.</DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={createRole}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="new-role-name">Rol Adı</Label>
                        <Input
                          id="new-role-name"
                          value={newRole.name}
                          onChange={(event) => {
                            const name = event.target.value;
                            setNewRole((current) => ({ ...current, name, code: roleCodeFromName(name) }));
                          }}
                          placeholder="Örn: Bölge Müdürü"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="new-role-code">Rol Kodu</Label>
                        <Input
                          id="new-role-code"
                          className="font-data"
                          value={newRole.code}
                          onChange={(event) => setNewRole((current) => ({ ...current, code: roleCodeFromName(event.target.value) }))}
                          placeholder="bolge_muduru"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="new-role-description">Açıklama</Label>
                      <Textarea
                        id="new-role-description"
                        value={newRole.description}
                        onChange={(event) => setNewRole((current) => ({ ...current, description: event.target.value }))}
                        placeholder="Bu rolün hangi ekip veya süreç için kullanılacağını yazın."
                      />
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">Başlangıç yetki şablonu</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Şablon yalnızca matrisi doldurur; kaydetmeden önce her yetkiyi değiştirebilirsiniz.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => applyRoleTemplate("readonly")}><BookOpenCheck className="size-3.5" /> Salt Okuma</Button>
                          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => applyRoleTemplate("operator")}><Workflow className="size-3.5" /> Operasyon</Button>
                          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => applyRoleTemplate("approver")}><ShieldCheck className="size-3.5" /> Onaylayıcı</Button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{newRole.permissionCodes.length} yetki seçili</span>
                        <span>·</span>
                        <span>{new Set(permissions.filter((permission) => newRole.permissionCodes.includes(permission.code)).map((permission) => permission.resource)).size} modül</span>
                      </div>
                    </div>
                    <PermissionMatrix
                      permissions={permissions}
                      selectedCodes={new Set(newRole.permissionCodes)}
                      editable
                      onToggle={toggleNewPermission}
                      maxHeight="max-h-[360px]"
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>İptal</Button>
                      <Button type="submit" disabled={creating}>{creating ? "Oluşturuluyor..." : "Rol Oluştur"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rol adı veya kodu ara..."
              className="h-9 bg-card pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-2">
          <div className="space-y-1">
            {filteredRoles.map((role) => {
              const active = role.id === selectedId;
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedId(role.id)}
                  className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-primary/10 text-primary" : "hover:bg-muted/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium leading-tight">{role.name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{role.code}</div>
                    </div>
                    <Badge variant="secondary" className={role.isSystemRole ? "bg-zinc-100 text-zinc-700" : "bg-primary/10 text-primary"}>
                      {role.isSystemRole ? "Sistem" : "Özel"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3.5" />
                    <span>{role.permissions.length} yetki</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        {selectedRole ? (
          <>
            <CardHeader className="border-b border-border/60 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary">{selectedRole.code}</Badge>
                    {selectedRole.isSystemRole && <Badge variant="secondary">Sistem rolü</Badge>}
                    {!canManageRoles && (
                      <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700">
                        <Lock className="size-3" /> Salt görüntüleme
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Rol Adı</Label>
                      <Input
                        value={draftName}
                        disabled={!canManageRoles}
                        onChange={(event) => setDraftName(event.target.value)}
                        className="h-10 bg-white text-base font-medium"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md border border-border/60 bg-muted/25 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">Seçili Yetki</div>
                        <div className="mt-0.5 text-lg font-medium tabular-nums">{draftCodes.length}</div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/25 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">Modül</div>
                        <div className="mt-0.5 text-lg font-medium tabular-nums">{roleResources}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Açıklama</Label>
                    <Textarea
                      value={draftDescription}
                      disabled={!canManageRoles}
                      onChange={(event) => setDraftDescription(event.target.value)}
                      className="min-h-[68px] bg-white"
                      placeholder="Rol açıklaması yok."
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManageRoles && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="month"
                        className="h-9 w-[145px]"
                        value={targetPeriod}
                        onChange={(event) => setTargetPeriod(event.target.value || currentPeriod())}
                      />
                      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openRoleTarget} disabled={targetLoading}>
                        <TrendingUp className="size-4" /> {targetLoading ? "Açılıyor..." : "Hedef Belirle"}
                      </Button>
                    </div>
                  )}
                  {dirty && (
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={resetDraft} disabled={saving}>
                      <X className="size-4" /> Vazgeç
                    </Button>
                  )}
                  <Button size="sm" className="h-9 gap-1.5" onClick={saveRole} disabled={!canManageRoles || !dirty || saving}>
                    <Save className="size-4" /> {saving ? "Kaydediliyor..." : "Kaydet"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {!canManageRoles && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                  <Lock />
                  <AlertTitle>Rolleri yalnızca Süper Admin düzenleyebilir</AlertTitle>
                  <AlertDescription>Bu sayfada rol ve yetki matrisi görüntülenebilir; değişiklik yapmak için süper admin hesabı gerekir.</AlertDescription>
                </Alert>
              )}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Yetki Matrisi</div>
                    <div className="text-xs text-muted-foreground">Kaynak bazında aksiyon yetkileri</div>
                  </div>
                  {dirty && <Badge variant="secondary" className="bg-primary/10 text-primary">Kaydedilmemiş değişiklik</Badge>}
                </div>
                <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-7" aria-label="Efektif yetki özeti">
                  {PERMISSION_ACTIONS.map((action) => (
                    <div key={action} className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-center">
                      <p className="font-display text-lg font-semibold leading-none tabular-nums">{effectiveActionCounts[action]}</p>
                      <p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACTION_LABEL[action]}</p>
                    </div>
                  ))}
                </div>
                <PermissionMatrix permissions={permissions} selectedCodes={selectedCodes} editable={canManageRoles} onToggle={toggleDraftPermission} />
              </div>
            </CardContent>
          </>
        ) : (
          <CardContent className="grid min-h-[520px] place-items-center p-8 text-center">
            <div>
              <ShieldCheck className="mx-auto size-9 text-muted-foreground" />
              <div className="mt-3 text-sm font-medium">Rol seçilmedi</div>
              <p className="mt-1 text-sm text-muted-foreground">Detay ve yetki matrisi için soldan bir rol seçin.</p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
    {canManageRoles && (
      <TargetDialog
        scope={targetScope}
        target={undefined}
        period={targetPeriod}
        onClose={() => setTargetScope(null)}
        onSave={saveRoleTarget}
      />
    )}
    </>
  );
}
