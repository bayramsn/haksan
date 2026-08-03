import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Pencil, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Badge } from "../../ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { SettingsSection } from "./settings-controls";

type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
};

const EMPTY_FORM = { name: "", code: "", description: "" };

function normalizeDepartmentCode(value: string) {
  return value
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function DepartmentSettingsCard() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("departments.create");
  const canUpdate = hasPermission("departments.update");
  const canDelete = hasPermission("departments.delete");
  const [rows, setRows] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DepartmentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const departments = await adminService.departments();
      setRows(
        (Array.isArray(departments) ? departments : [])
          .map((department: any) => ({
            id: String(department.id),
            code: String(department.code ?? ""),
            name: String(department.name ?? ""),
            description: department.description ? String(department.description) : null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "tr-TR"))
      );
    } catch (error: any) {
      setLoadError(error?.message ?? "Departmanlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    if (!term) return rows;
    return rows.filter((row) =>
      [row.name, row.code, row.description]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("tr-TR").includes(term))
    );
  }, [query, rows]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (department: DepartmentRow) => {
    setEditing(department);
    setForm({
      name: department.name,
      code: department.code,
      description: department.description ?? "",
    });
    setDialogOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const code = normalizeDepartmentCode(form.code);
    if (!name || !code) {
      toast.error("Departman adı ve kodu zorunlu");
      return;
    }

    setSaving(true);
    try {
      const saved = editing
        ? await adminService.updateDept(editing.id, {
            name,
            description: form.description.trim() || null,
          })
        : await adminService.createDept({
            name,
            code,
            description: form.description.trim() || undefined,
          });
      const normalized: DepartmentRow = {
        id: String(saved.id),
        code: String(saved.code ?? code),
        name: String(saved.name ?? name),
        description: saved.description ? String(saved.description) : null,
      };
      setRows((current) =>
        [...current.filter((row) => row.id !== normalized.id), normalized].sort((a, b) =>
          a.name.localeCompare(b.name, "tr-TR")
        )
      );
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      toast.success(editing ? "Departman güncellendi" : "Departman eklendi", {
        description: "Kullanıcı ekleme ve düzenleme ekranlarına yansıtıldı.",
      });
    } catch (error: any) {
      toast.error(editing ? "Departman güncellenemedi" : "Departman eklenemedi", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeDepartment = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await adminService.deleteDept(pendingDelete.id);
      setRows((current) => current.filter((row) => row.id !== pendingDelete.id));
      toast.success("Departman çıkarıldı", {
        description: "Kullanıcı formlarındaki departman listesinden kaldırıldı.",
      });
      setPendingDelete(null);
    } catch (error: any) {
      toast.error("Departman çıkarılamadı", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <SettingsSection
        icon={<UsersRound />}
        tone="primary"
        title="Kullanıcı Departmanları"
        description="Kullanıcı eklerken ve düzenlerken seçilebilen departman listesini yönetin."
        action={
          canCreate ? (
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="size-3.5" /> Departman Ekle
            </Button>
          ) : null
        }
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Departman ara..."
              className="pl-9"
            />
          </div>
          <Badge variant="outline" className="w-fit font-normal">
            {rows.length} departman
          </Badge>
        </div>

        {loadError ? (
          <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <span className="text-destructive">{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Tekrar dene
            </Button>
          </div>
        ) : loading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[76px] animate-pulse rounded-lg border border-border/50 bg-muted/30" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
            <Building2 className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">{rows.length ? "Aramayla eşleşen departman yok" : "Henüz departman yok"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length ? "Farklı bir arama deneyin." : "İlk departmanı ekleyerek kullanıcı seçeneklerini oluşturun."}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filteredRows.map((department) => (
              <div key={department.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">{department.name}</p>
                    <Badge variant="secondary" className="shrink-0 font-mono text-[9px] uppercase">
                      {department.code}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {department.description || "Kullanıcı departmanı"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  {canUpdate && (
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(department)} aria-label={`${department.name} departmanını düzenle`}>
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => setPendingDelete(department)} aria-label={`${department.name} departmanını çıkar`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Departmanı Düzenle" : "Yeni Departman"}</DialogTitle>
            <DialogDescription>
              Bu kayıt kullanıcı ekleme ve departman düzenleme ekranlarında seçenek olarak gösterilir.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="department-settings-name" className="text-xs">Departman Adı *</Label>
              <Input
                id="department-settings-name"
                className="mt-1.5"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Satış"
                maxLength={255}
                disabled={saving}
              />
            </div>
            <div>
              <Label htmlFor="department-settings-code" className="text-xs">Departman Kodu *</Label>
              <Input
                id="department-settings-code"
                className="mt-1.5 font-mono"
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: normalizeDepartmentCode(event.target.value) }))}
                placeholder="satis"
                maxLength={64}
                disabled={saving || Boolean(editing)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Kod sistem eşleştirmelerinde kullanılır ve sonradan değiştirilemez.</p>
            </div>
            <div>
              <Label htmlFor="department-settings-description" className="text-xs">Açıklama</Label>
              <Textarea
                id="department-settings-description"
                className="mt-1.5"
                rows={3}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                maxLength={2000}
                disabled={saving}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Vazgeç</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {editing ? "Kaydet" : "Departman Ekle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Departman listeden çıkarılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{pendingDelete?.name}</span> kullanıcı formlarındaki seçeneklerden kaldırılır. Atanmış kullanıcı veya erişim alanı varsa işlem güvenlik nedeniyle engellenir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void removeDepartment();
              }}
            >
              {deleting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Listeden Çıkar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
