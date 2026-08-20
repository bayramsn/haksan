import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { adminService } from "../../../lib/services";
import { PERMISSION_RESOURCES, usernameSchema, type PermissionResource } from "@haksan/shared";

export type DeptOption = { id: string; name: string; code?: string };
export type RoleOption = { id: string; code: string; name: string; description?: string | null; isSystemRole?: boolean };
export type DivisionOption = { id: string; code: string; name: string };
/** CRM Alan Ayarları > Kullanıcı Ünvanları listesinden gelen seçenek. */
export type TitleOption = { id: string; name: string };

export type UserAccessScopeRow = { resource: PermissionResource; departmentId: string | null; divisionId: string | null; isPrimary: boolean };

const PERMISSION_RESOURCE_LABELS: Record<PermissionResource, string> = {
  tenants: "Kiracı / Kurum",
  users: "Kullanıcılar",
  roles: "Roller",
  departments: "Departmanlar",
  divisions: "Bölümler",
  companies: "Firmalar / Cari Kart",
  contacts: "Kontaklar",
  leads: "Fırsatlar",
  lead_assignment_rules: "Fırsat Atama Kuralları",
  opportunities: "Satış Kartları",
  activities: "Aktiviteler",
  calendar: "Takvim",
  competitors: "Rakipler",
  brands: "Markalar / Referanslar",
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
  shipments: "Sevkiyat / Teslimat",
  installations: "Kurulumlar",
  service_tickets: "Servis Talepleri",
  receivables: "Cari Rapor / Alacaklar",
  payments: "Ödemeler",
  files: "Dokümanlar",
  reports: "Raporlar",
  audit: "Denetim Kayıtları",
};

const ACCESS_SCOPE_RESOURCES = PERMISSION_RESOURCES.map((code) => ({
  code,
  label: PERMISSION_RESOURCE_LABELS[code],
}));

const isPermissionResource = (value: string): value is PermissionResource =>
  (PERMISSION_RESOURCES as readonly string[]).includes(value);

export function CreateUserDialog({
  open,
  onOpenChange,
  departments,
  roles,
  divisions,
  titles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: DeptOption[];
  roles: RoleOption[];
  divisions: DivisionOption[];
  titles: TitleOption[];
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    username: "",
    password: "",
    phone: "",
    departmentId: "",
    titleId: "",
    roleCodes: [] as string[],
    divisionIds: [] as string[],
  });

  useEffect(() => {
    if (!open) {
      setForm({ fullName: "", email: "", username: "", password: "", phone: "", departmentId: "", titleId: "", roleCodes: [], divisionIds: [] });
    }
  }, [open]);

  const toggleRole = (code: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      roleCodes: checked ? [...new Set([...f.roleCodes, code])].sort() : f.roleCodes.filter((c) => c !== code),
    }));
  };

  const toggleDivision = (id: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      // Seçim sırasını koru — ilk seçilen birincil (varsayılan aktif) bölüm olur.
      divisionIds: checked ? [...f.divisionIds.filter((d) => d !== id), id] : f.divisionIds.filter((d) => d !== id),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim() || !form.username.trim() || form.password.length < 8) {
      toast.error("Ad, e-posta, kullanıcı adı ve en az 8 karakterli şifre zorunlu");
      return;
    }
    const username = form.username.trim().toLowerCase();
    if (username) {
      const parsed = usernameSchema.safeParse(username);
      if (!parsed.success) {
        toast.error("Kullanıcı adı geçersiz", { description: parsed.error.issues[0]?.message });
        return;
      }
    }
    setSaving(true);
    try {
      await adminService.createUser({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        username,
        password: form.password,
        phone: form.phone.trim() || undefined,
        departmentId: form.departmentId || undefined,
        titleId: form.titleId || undefined,
        roleCodes: form.roleCodes,
        divisionIds: form.divisionIds,
      });
      toast.success("Kullanıcı oluşturuldu");
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast.error("Kullanıcı eklenemedi", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni Kullanıcı</DialogTitle>
          <DialogDescription>Hesap oluşturun, departman ve roller atayın.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs" htmlFor="new-user-name">Ad Soyad *</Label>
            <Input id="new-user-name" autoComplete="name" className="mt-1.5" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs" htmlFor="new-user-email">E-posta *</Label>
            <Input id="new-user-email" type="email" autoComplete="email" className="mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs" htmlFor="new-user-username">Kullanıcı Adı *</Label>
            <Input
              id="new-user-username"
              // type="email" değil: kullanıcı adı e-posta biçiminde değildir.
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="örn. raifsenturk"
              className="mt-1.5"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Girişte kullanılır. 3–32 karakter; harf, rakam, nokta, alt çizgi ve tire.
              E-posta alanı bildirim ve şifre sıfırlama için ayrıca korunur.
            </p>
          </div>
          <div>
            <Label className="text-xs" htmlFor="new-user-password">Şifre *</Label>
            <Input id="new-user-password" type="password" autoComplete="new-password" className="mt-1.5" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs" htmlFor="new-user-phone">Telefon</Label>
            <Input id="new-user-phone" type="tel" autoComplete="tel" className="mt-1.5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs" htmlFor="new-user-department">Departman</Label>
            <Select value={form.departmentId || "__none__"} onValueChange={(v) => setForm({ ...form, departmentId: v === "__none__" ? "" : v })}>
              <SelectTrigger id="new-user-department" className="mt-1.5"><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Atanmadı —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs" htmlFor="new-user-title">Ünvan</Label>
            <Select value={form.titleId || "__none__"} onValueChange={(v) => setForm({ ...form, titleId: v === "__none__" ? "" : v })}>
              <SelectTrigger id="new-user-title" className="mt-1.5"><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Atanmadı —</SelectItem>
                {titles.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Teklif, proforma ve sözleşme çıktılarında isminin altında görünür.
            </p>
          </div>
          {divisions.length > 0 && (
            <div>
              <Label className="text-xs">Bölüm (CNC / Üniversal / Sac İşleme)</Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Kullanıcının erişebileceği bölümler. İlk seçilen, varsayılan aktif bölüm olur. Boş bırakılırsa ticari veri görmez.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {divisions.map((d) => {
                  const checked = form.divisionIds.includes(d.id);
                  const primary = checked && form.divisionIds[0] === d.id;
                  return (
                    <label key={d.id} className="flex items-center gap-2 rounded border border-border/60 p-2 text-sm">
                      <Checkbox aria-label={`${d.name} bölüm erişimi`} checked={checked} onCheckedChange={(v) => toggleDivision(d.id, v === true)} />
                      <span className="min-w-0 truncate">{d.name}</span>
                      {primary && <Badge variant="secondary" className="ml-auto text-[10px]">Birincil</Badge>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {roles.length > 0 && (
            <div>
              <Label className="text-xs">Roller</Label>
              <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 rounded border border-border/60 p-2 text-sm">
                    <Checkbox
                      aria-label={`${role.name} rolünü ata`}
                      checked={form.roleCodes.includes(role.code)}
                      onCheckedChange={(v) => toggleRole(role.code, v === true)}
                    />
                    <span>{role.name}</span>
                    {role.isSystemRole && <Badge variant="secondary" className="text-[10px]">Sistem</Badge>}
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Oluştur"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Süper admin için kullanıcı bilgilerini (ad, e-posta, telefon) düzenleme ve şifre
 * sıfırlama dialogu. E-posta ve şifre değişimi backend'de yalnızca super_admin'e
 * açıktır (admin.controller#updateUser → requireSuperAdmin), bu yüzden bu dialog
 * UsersPage'de sadece super_admin'e gösterilir.
 */
export function UserEditDialog({
  user,
  saving,
  onClose,
  onSave,
}: {
  user: { id: string; name: string; email: string; username?: string | null; phone?: string | null } | null;
  saving: boolean;
  onClose: () => void;
  onSave: (
    userId: string,
    patch: { fullName: string; email: string; username: string; phone: string | null; password?: string }
  ) => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  useEffect(() => {
    if (user) {
      setFullName(user.name ?? "");
      setEmail(user.email ?? "");
      setUsername(user.username ?? "");
      setPhone(user.phone ?? "");
      setPassword("");
      setPasswordConfirm("");
    }
  }, [user]);

  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Ad Soyad zorunlu");
      return;
    }
    if (!email.trim()) {
      toast.error("E-posta zorunlu");
      return;
    }
    const nextUsername = username.trim().toLowerCase();
    const parsedUsername = usernameSchema.safeParse(nextUsername);
    if (!parsedUsername.success) {
      toast.error("Kullanıcı adı geçersiz", { description: parsedUsername.error.issues[0]?.message });
      return;
    }
    if (password) {
      if (password.length < 8) {
        toast.error("Şifre en az 8 karakter olmalı");
        return;
      }
      if (password !== passwordConfirm) {
        toast.error("Şifreler eşleşmiyor");
        return;
      }
    }
    await onSave(user.id, {
      fullName: fullName.trim(),
      email: email.trim(),
      username: nextUsername,
      phone: phone.trim() || null,
      // Boş bırakılırsa mevcut şifre korunur.
      ...(password ? { password } : {}),
    });
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kullanıcıyı Düzenle · {user.name}</DialogTitle>
          <DialogDescription>Ad, e-posta ve telefonu güncelleyin veya şifreyi sıfırlayın.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs">Ad Soyad *</Label>
            <Input className="mt-1.5" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={saving} />
          </div>
          <div>
            <Label className="text-xs">E-posta *</Label>
            <Input type="email" className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
          </div>
          <div>
            <Label className="text-xs">Kullanıcı Adı</Label>
            <Input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="örn. raifsenturk"
              className="mt-1.5"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={saving}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Girişte kullanılır; e-posta iletişim için korunur. Değiştirmek kullanıcının açık oturumlarını sonlandırır.
            </p>
          </div>
          <div>
            <Label className="text-xs">Telefon</Label>
            <Input className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} />
          </div>
          <div className="rounded-md border border-border/60 p-3 space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Şifre Sıfırla (isteğe bağlı)</div>
            <div>
              <Label className="text-xs">Yeni Şifre</Label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Değiştirmemek için boş bırakın"
                className="mt-1.5"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
              />
            </div>
            {password && (
              <div>
                <Label className="text-xs">Yeni Şifre (Tekrar)</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  className="mt-1.5"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  disabled={saving}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">En az 8 karakter.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UserDepartmentDialog({
  user,
  departments,
  divisions,
  titles,
  saving,
  onClose,
  onSave,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    departmentId?: string | null;
    titleId?: string | null;
    active: boolean;
    divisionIds?: string[];
    accessScopes?: UserAccessScopeRow[];
  } | null;
  departments: DeptOption[];
  divisions: DivisionOption[];
  titles: TitleOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (userId: string, departmentId: string | null, active: boolean, divisionIds: string[], accessScopes: UserAccessScopeRow[], titleId: string | null) => Promise<void>;
}) {
  const [departmentId, setDepartmentId] = useState<string>("");
  const [titleId, setTitleId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [accessScopes, setAccessScopes] = useState<UserAccessScopeRow[]>([]);

  useEffect(() => {
    if (user) {
      setDepartmentId(user.departmentId ?? "");
      setTitleId(user.titleId ?? "");
      setActive(user.active);
      setDivisionIds(user.divisionIds ?? []);
      setAccessScopes(
        user.accessScopes?.length
          ? user.accessScopes.map((scope) => ({ ...scope }))
          : ACCESS_SCOPE_RESOURCES.map((resource) => ({
              resource: resource.code,
              departmentId: user.departmentId ?? null,
              divisionId: user.divisionIds?.[0] ?? null,
              isPrimary: true,
            }))
      );
    }
  }, [user]);

  if (!user) return null;

  const toggleDivision = (id: string, checked: boolean) => {
    setDivisionIds((current) =>
      checked ? [...current.filter((d) => d !== id), id] : current.filter((d) => d !== id)
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(user.id, departmentId || null, active, divisionIds, accessScopes, titleId || null);
  };

  const changePrimaryDepartment = (value: string) => {
    const nextDepartmentId = value === "__none__" ? "" : value;
    const previousDepartmentId = departmentId || null;
    setDepartmentId(nextDepartmentId);
    // Birincil departmana bağlı kapsamları birlikte taşı; Tümü (null) veya başka
    // departmanlara özel kapsamları koru.
    if (previousDepartmentId) {
      setAccessScopes((rows) =>
        rows.map((scope) =>
          scope.departmentId === previousDepartmentId
            ? { ...scope, departmentId: nextDepartmentId || null }
            : scope
        )
      );
    }
  };

  const updateScope = (index: number, patch: Partial<UserAccessScopeRow>) => {
    setAccessScopes((rows) => {
      const currentResource = patch.resource ?? rows[index]?.resource;
      return rows.map((row, rowIndex) => {
        if (rowIndex === index) return { ...row, ...patch };
        if (patch.isPrimary === true && row.resource === currentResource) return { ...row, isPrimary: false };
        return row;
      });
    });
  };

  const addScope = () => {
    setAccessScopes((rows) => [
      ...rows,
      {
        resource: ACCESS_SCOPE_RESOURCES[0].code,
        departmentId: departmentId || null,
        divisionId: divisionIds[0] ?? null,
        isPrimary: false,
      },
    ]);
  };

  const removeScope = (index: number) => {
    setAccessScopes((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Departman & Bölüm · {user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs">Departman</Label>
            <Select value={departmentId || "__none__"} onValueChange={changePrimaryDepartment}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Atanmadı —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ünvan</Label>
            <Select value={titleId || "__none__"} onValueChange={(v) => setTitleId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Atanmadı —</SelectItem>
                {titles.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Teklif, proforma ve sözleşme çıktılarında kullanıcının isminin altında yazar.
            </p>
          </div>
          {divisions.length > 0 && (
            <div>
              <Label className="text-xs">Bölüm (CNC / Üniversal / Sac İşleme)</Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                İlk seçilen, varsayılan aktif bölüm olur. Boş bırakılırsa kullanıcı ticari veri görmez.
              </p>
              <div className="mt-2 grid gap-2">
                {divisions.map((d) => {
                  const checked = divisionIds.includes(d.id);
                  const primary = checked && divisionIds[0] === d.id;
                  return (
                    <label key={d.id} className="flex items-center gap-2 rounded border border-border/60 p-2 text-sm">
                      <Checkbox checked={checked} onCheckedChange={(v) => toggleDivision(d.id, v === true)} disabled={saving} />
                      <span className="min-w-0 truncate">{d.name}</span>
                      {primary && <Badge variant="secondary" className="ml-auto text-[10px]">Birincil</Badge>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Yetki Alanları</Label>
              <Button type="button" size="sm" variant="outline" onClick={addScope} disabled={saving}>Kapsam Ekle</Button>
            </div>
            <div className="mt-2 overflow-hidden rounded-md border border-border/60">
              <div className="grid grid-cols-[1fr_1fr_1fr_80px_72px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Sayfa</span>
                <span>Departman</span>
                <span>Bölüm</span>
                <span>Birincil</span>
                <span></span>
              </div>
              <div className="divide-y">
                {accessScopes.map((scope, index) => (
                  <div key={`${scope.resource}-${index}`} className="grid grid-cols-[1fr_1fr_1fr_80px_72px] gap-2 px-3 py-2 text-sm">
                    <Select
                      value={scope.resource}
                      onValueChange={(value) => {
                        if (isPermissionResource(value)) updateScope(index, { resource: value });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACCESS_SCOPE_RESOURCES.map((resource) => (
                          <SelectItem key={resource.code} value={resource.code}>{resource.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={scope.departmentId ?? "__all__"}
                      onValueChange={(value) => updateScope(index, { departmentId: value === "__all__" ? null : value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Tüm Departmanlar</SelectItem>
                        {departments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={scope.divisionId ?? "__all__"}
                      onValueChange={(value) => updateScope(index, { divisionId: value === "__all__" ? null : value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Tümü</SelectItem>
                        {divisions.map((division) => (
                          <SelectItem key={division.id} value={division.id}>{division.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={scope.isPrimary}
                        onCheckedChange={(value) => updateScope(index, { isPrimary: value === true })}
                        disabled={saving}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeScope(index)} disabled={saving || accessScopes.length <= 1}>Sil</Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Aktif hesap</div>
              <div className="text-xs text-muted-foreground">Pasif kullanıcılar giriş yapamaz</div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} disabled={saving} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
