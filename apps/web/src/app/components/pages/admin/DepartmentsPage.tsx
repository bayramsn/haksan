import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { DepartmentTargetButton } from "../../admin/DepartmentTargetDialog";
import { safeLoad } from "../../../../lib/safeLoad";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import { Plus } from "lucide-react";
import { toast } from "sonner";

type DeptItem = { id: string; code?: string; name: string; description?: string };

export function DepartmentsPage() {
  const { hasRole, hasPermission } = useAuth();
  const canManage = hasRole("super_admin") || hasRole("admin") || hasPermission("departments.create");
  const canSetTargets = hasRole("super_admin") || hasRole("admin");
  const [rows, setRows] = useState<DeptItem[]>([]);
  const [deptTargets, setDeptTargets] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetPeriod, setTargetPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "" });

  const loadTargets = useCallback(async (depts: DeptItem[]) => {
    if (!canSetTargets) return;
    const targets = await safeLoad("department-targets", () =>
      adminService.departmentTargets({ period: targetPeriod })
    );
    if (targets) {
      const map: Record<string, boolean> = {};
      (targets as any[]).forEach((t) => {
        map[t.departmentId] = !!(t.salesAmount || t.quoteTarget || t.visitTarget);
      });
      setDeptTargets(map);
    } else {
      setDeptTargets(Object.fromEntries(depts.map((d) => [d.id, false])));
    }
  }, [canSetTargets, targetPeriod]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const depts = await safeLoad("departments", () => adminService.departments() as Promise<DeptItem[]>);
    if (depts) {
      setRows(depts);
      await loadTargets(depts);
    } else {
      setLoadError("Departmanlar yüklenemedi.");
    }
    setLoading(false);
  }, [loadTargets]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return toast.error("Ad ve kod zorunlu");
    setSaving(true);
    try {
      const created = await adminService.createDept({
        name: form.name.trim(),
        code: form.code.trim().toLowerCase().replace(/\s+/g, "_"),
        description: form.description.trim() || undefined,
      });
      toast.success("Departman eklendi");
      setOpen(false);
      setForm({ name: "", code: "", description: "" });
      setRows((prev) => {
        const next = [...prev.filter((d) => d.id !== created.id), created as DeptItem];
        return next.sort((a, b) => a.name.localeCompare(b.name, "tr"));
      });
      await load();
    } catch (err: any) {
      toast.error("Departman eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Departmanlar</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {canSetTargets && (
            <Input type="month" className="h-9 w-[150px]" value={targetPeriod} onChange={(e) => setTargetPeriod(e.target.value)} />
          )}
          {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1"><Plus className="size-4" /> Departman</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Yeni Departman</DialogTitle>
                <DialogDescription>Bu tenant'a yeni bir departman ekleyin.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label className="text-xs">Ad *</Label>
                  <Input className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Satış" />
                </div>
                <div>
                  <Label className="text-xs">Kod *</Label>
                  <Input className="mt-1.5" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="sales" />
                </div>
                <div>
                  <Label className="text-xs">Açıklama</Label>
                  <Textarea className="mt-1.5" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
                  <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </CardHeader>
      {loadError && (
        <div className="mx-4 mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {loadError}
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Departman</TableHead>
              <TableHead>Kod</TableHead>
              <TableHead>Açıklama</TableHead>
              {canSetTargets && <TableHead className="w-28">Hedef</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.name}</TableCell>
                <TableCell className="text-muted-foreground">{d.code ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{d.description ?? "—"}</TableCell>
                {canSetTargets && (
                  <TableCell>
                    <DepartmentTargetButton department={d} period={targetPeriod} hasTarget={!!deptTargets[d.id]} onSaved={load} />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={canSetTargets ? 4 : 3} className="text-center py-8 text-sm text-muted-foreground">Henüz departman yok.</TableCell></TableRow>
            )}
            {loading && (
              <TableRow><TableCell colSpan={canSetTargets ? 4 : 3} className="text-center py-8 text-sm text-muted-foreground">Yükleniyor...</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
