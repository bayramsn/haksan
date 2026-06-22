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

export type DeptOption = { id: string; name: string; code?: string };
export type RoleOption = { id: string; code: string; name: string; description?: string | null; isSystemRole?: boolean };
export type DivisionOption = { id: string; code: string; name: string };

export function CreateUserDialog({
  open,
  onOpenChange,
  departments,
  roles,
  divisions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: DeptOption[];
  roles: RoleOption[];
  divisions: DivisionOption[];
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    departmentId: "",
    roleCodes: [] as string[],
    divisionIds: [] as string[],
  });

  useEffect(() => {
    if (!open) {
      setForm({ fullName: "", email: "", password: "", phone: "", departmentId: "", roleCodes: [], divisionIds: [] });
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
    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 8) {
      toast.error("Ad, e-posta ve en az 8 karakterli şifre zorunlu");
      return;
    }
    setSaving(true);
    try {
      await adminService.createUser({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        departmentId: form.departmentId || undefined,
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
            <Label className="text-xs">Ad Soyad *</Label>
            <Input className="mt-1.5" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">E-posta *</Label>
            <Input type="email" className="mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Şifre *</Label>
            <Input type="password" className="mt-1.5" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Telefon</Label>
            <Input className="mt-1.5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Departman</Label>
            <Select value={form.departmentId || "__none__"} onValueChange={(v) => setForm({ ...form, departmentId: v === "__none__" ? "" : v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Atanmadı —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                      <Checkbox checked={checked} onCheckedChange={(v) => toggleDivision(d.id, v === true)} />
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

export function UserDepartmentDialog({
  user,
  departments,
  divisions,
  saving,
  onClose,
  onSave,
}: {
  user: { id: string; name: string; email: string; departmentId?: string | null; active: boolean; divisionIds?: string[] } | null;
  departments: DeptOption[];
  divisions: DivisionOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (userId: string, departmentId: string | null, active: boolean, divisionIds: string[]) => Promise<void>;
}) {
  const [departmentId, setDepartmentId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      setDepartmentId(user.departmentId ?? "");
      setActive(user.active);
      setDivisionIds(user.divisionIds ?? []);
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
    await onSave(user.id, departmentId || null, active, divisionIds);
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Departman & Bölüm · {user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs">Departman</Label>
            <Select value={departmentId || "__none__"} onValueChange={(v) => setDepartmentId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Atanmadı —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
