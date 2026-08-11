import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { TargetDialog, currentPeriod, hasTargetValue, targetFromApi, targetToApi, type UserTarget } from "../../admin/TargetDialog";
import { safeLoad } from "../../../../lib/safeLoad";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import { EmptyState } from "../../shared/EmptyState";
import { InsightStat } from "../../shared/PremiumPrimitives";
import { Building2, CalendarRange, LayoutGrid, List, Network, Plus, RotateCcw, Search, Target } from "lucide-react";
import { toast } from "sonner";

type DeptItem = { id: string; code?: string; name: string; description?: string };

const normalizeDepartmentCode = (value: string) =>
  value
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

export function DepartmentsPage() {
  const { hasRole, hasPermission } = useAuth();
  const canManage = hasRole("super_admin") || hasRole("admin") || hasPermission("departments.create");
  const canSetTargets = hasRole("super_admin") || hasRole("admin");
  const [rows, setRows] = useState<DeptItem[]>([]);
  const [deptTargets, setDeptTargets] = useState<Record<string, UserTarget>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod());
  const [targetDepartment, setTargetDepartment] = useState<DeptItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"organization" | "table">(() => {
    try {
      return localStorage.getItem("haksan:departments:view") === "table" ? "table" : "organization";
    } catch {
      return "organization";
    }
  });

  const loadTargets = useCallback(async (_depts: DeptItem[]) => {
    if (!canSetTargets) return;
    const targets = await safeLoad("department-targets", () =>
      adminService.departmentTargets({ period: targetPeriod })
    );
    if (targets) {
      const map: Record<string, UserTarget> = {};
      (targets as any[]).forEach((t) => {
        map[t.departmentId] = targetFromApi(t);
      });
      setDeptTargets(map);
    } else {
      setDeptTargets({});
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
    if (!form.name.trim() || !normalizeDepartmentCode(form.code)) return toast.error("Ad ve geçerli bir kod zorunlu");
    setSaving(true);
    try {
      const created = await adminService.createDept({
        name: form.name.trim(),
        code: normalizeDepartmentCode(form.code),
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

  const saveDepartmentTarget = async (_scope: { id: string }, target: UserTarget) => {
    const saved = await adminService.saveDepartmentTarget(_scope.id, targetToApi({ ...target, period: targetPeriod }));
    setDeptTargets((prev) => ({ ...prev, [_scope.id]: targetFromApi(saved) }));
  };

  const changeView = (nextView: "organization" | "table") => {
    setView(nextView);
    try { localStorage.setItem("haksan:departments:view", nextView); } catch { /* storage erişimi opsiyonel */ }
  };

  const filteredRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    if (!term) return rows;
    return rows.filter((department) =>
      [department.name, department.code, department.description]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("tr-TR").includes(term))
    );
  }, [query, rows]);

  const departmentsWithTargets = useMemo(
    () => rows.filter((department) => hasTargetValue(deptTargets[department.id])).length,
    [deptTargets, rows],
  );

  return (
    <div className="crm-page">
      <section className="premium-blueprint precision-corners overflow-hidden rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="ui-eyebrow text-primary">Organizasyon mimarisi</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Departman ağı</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Şirket kapsamındaki ekipleri, kod yapılarını ve dönemsel hedef hazırlığını tek yüzeyde izleyin.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[480px]">
            <InsightStat label="Departman" value={rows.length} icon={<Network />} />
            <InsightStat label="Hedefli" value={departmentsWithTargets} icon={<Target />} tone="success" />
            <InsightStat label="Dönem" value={targetPeriod} icon={<CalendarRange />} />
          </div>
        </div>
      </section>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="gap-4 border-b border-border/60 bg-muted/10 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="text-base">Organizasyon kayıtları</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{filteredRows.length} / {rows.length} departman gösteriliyor</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-[280px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Departman, kod veya açıklama ara..." className="h-9 bg-card pl-9" />
              </div>
              <div className="flex h-9 items-center rounded-lg border border-border/70 bg-card p-1" aria-label="Görünüm seçimi">
                <Button type="button" variant={view === "organization" ? "secondary" : "ghost"} size="sm" className="h-7 gap-1.5 px-2.5" onClick={() => changeView("organization")} aria-pressed={view === "organization"}><LayoutGrid className="size-3.5" /> Organizasyon</Button>
                <Button type="button" variant={view === "table" ? "secondary" : "ghost"} size="sm" className="h-7 gap-1.5 px-2.5" onClick={() => changeView("table")} aria-pressed={view === "table"}><List className="size-3.5" /> Tablo</Button>
              </div>
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
                <DialogDescription>Şirket organizasyonuna yeni bir çalışma alanı ekleyin. Kod, kayıt ve raporlama kapsamını tanımlar.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="premium-blueprint precision-corners rounded-xl border border-primary/15 p-3">
                  <div className="relative flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="size-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{form.name.trim() || "Yeni departman"}</p>
                      <p className="font-data text-[10px] text-muted-foreground">HAKSAN / {normalizeDepartmentCode(form.code) || "departman_kodu"}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs" htmlFor="new-department-name">Ad *</Label>
                  <Input id="new-department-name" className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Satış" />
                </div>
                <div>
                  <Label className="text-xs" htmlFor="new-department-code">Kod *</Label>
                  <Input id="new-department-code" className="mt-1.5 font-data" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="sales" />
                </div>
                <div>
                  <Label className="text-xs" htmlFor="new-department-description">Açıklama</Label>
                  <Textarea id="new-department-description" className="mt-1.5" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
          </div>
        </CardHeader>
      {loadError && (
        <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()}><RotateCcw className="size-3.5" /> Tekrar dene</Button>
        </div>
      )}

      {loading ? (
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-border/50 bg-muted/35" />)}
        </CardContent>
      ) : filteredRows.length === 0 ? (
        <CardContent className="p-5">
          <EmptyState icon={<Network />} eyebrow="ORGANİZASYON" title={rows.length ? "Aramayla eşleşen departman yok" : "Henüz departman yok"} description={rows.length ? "Farklı bir ad, kod veya açıklama deneyin." : "Organizasyon yapısını oluşturmak için ilk departmanı ekleyin."} />
        </CardContent>
      ) : view === "organization" ? (
        <CardContent className="p-4 sm:p-5">
          <div className="mx-auto mb-8 max-w-md">
            <div className="premium-blueprint precision-corners relative rounded-xl border border-primary/25 bg-primary/[0.04] p-4 text-center shadow-sm">
              <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Building2 className="size-5" /></span>
              <p className="mt-2 font-display text-lg font-semibold">Haksan Makina</p>
              <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground">ŞİRKET ORGANİZASYON KÖKÜ</p>
              <span className="absolute left-1/2 top-full h-8 w-px bg-border" aria-hidden="true" />
            </div>
          </div>
          <div className="relative grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <span className="pointer-events-none absolute -top-4 left-[16.66%] right-[16.66%] hidden h-px bg-border xl:block" aria-hidden="true" />
            {filteredRows.map((department) => {
              const targetExists = hasTargetValue(deptTargets[department.id]);
              return (
                <article key={department.id} className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                  <span className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,var(--brand-blue),var(--operation-blue),transparent)]" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Network className="size-4" /></span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{department.name}</h3>
                        <p className="mt-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-primary/75">{department.code || "KOD YOK"}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={targetExists ? "border-success/25 bg-success/5 text-success" : "text-muted-foreground"}>{targetExists ? "Hedefli" : "Taslak"}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{department.description || "Bu departman için henüz açıklama eklenmemiş."}</p>
                  {canSetTargets && (
                    <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                      <span className="text-[11px] text-muted-foreground">Dönem · {targetPeriod}</span>
                      <Button variant={targetExists ? "outline" : "secondary"} size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setTargetDepartment(department)}><Target className="size-3.5" /> {targetExists ? "Hedefi Düzenle" : "Hedef Ekle"}</Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </CardContent>
      ) : (
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
            {filteredRows.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.name}</TableCell>
                <TableCell className="text-muted-foreground">{d.code ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{d.description ?? "—"}</TableCell>
                {canSetTargets && (
                  <TableCell>
                    <Button variant={hasTargetValue(deptTargets[d.id]) ? "outline" : "secondary"} size="sm" className="gap-1.5" onClick={() => setTargetDepartment(d)}>
                      <Target className="size-3.5" /> {hasTargetValue(deptTargets[d.id]) ? "Düzenle" : "Ekle"}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}
      </Card>
    {canSetTargets && (
      <TargetDialog
        scope={targetDepartment ? { kind: "department", id: targetDepartment.id, name: targetDepartment.name, subtitle: targetDepartment.code } : null}
        target={targetDepartment ? deptTargets[targetDepartment.id] : undefined}
        period={targetPeriod}
        onClose={() => setTargetDepartment(null)}
        onSave={saveDepartmentTarget}
      />
    )}
    </div>
  );
}
