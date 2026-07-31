import { useEffect, useMemo, useState } from "react";
import { GitBranch, Pencil, Plus, RotateCw, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";
import { leadAssignmentRuleService } from "../../../../lib/services";
import { useStore } from "../../../lib/store";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Checkbox } from "../../ui/checkbox";
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
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";

type Rule = {
  id: string;
  name: string;
  priority: number;
  active: boolean;
  divisionId: string | null;
  criteria: { cities: string[]; productTerms: string[]; sourceCodes: string[] };
  assigneeUserIds: string[];
};

const csv = (value: string) =>
  [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];

export function LeadAssignmentRulesCard() {
  const { user } = useAuth();
  const { users } = useStore();
  const salesUsers = useMemo(
    () => users.filter((candidate) => candidate.active && candidate.roleCodes?.includes("sales")),
    [users],
  );
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    priority: "100",
    divisionId: "all",
    cities: "",
    products: "",
    sources: "",
    assigneeUserIds: [] as string[],
  });

  const load = async () => {
    setLoading(true);
    try {
      setRules(await leadAssignmentRuleService.list());
    } catch (error: any) {
      toast.error("Lead atama kuralları yüklenemedi", { description: error?.message });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const showCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      priority: "100",
      divisionId: "all",
      cities: "",
      products: "",
      sources: "",
      assigneeUserIds: [],
    });
    setOpen(true);
  };
  const showEdit = (rule: Rule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      priority: String(rule.priority),
      divisionId: rule.divisionId ?? "all",
      cities: rule.criteria.cities.join(", "),
      products: rule.criteria.productTerms.join(", "),
      sources: rule.criteria.sourceCodes.join(", "),
      assigneeUserIds: rule.assigneeUserIds,
    });
    setOpen(true);
  };
  const selectableSalesUsers = useMemo(
    () => form.divisionId === "all"
      ? salesUsers
      : salesUsers.filter((candidate) => candidate.divisionIds?.includes(form.divisionId)),
    [form.divisionId, salesUsers],
  );

  const toggleRule = async (rule: Rule) => {
    try {
      await leadAssignmentRuleService.update(rule.id, { active: !rule.active });
      await load();
      toast.success(rule.active ? "Atama kuralı pasifleştirildi" : "Atama kuralı aktifleştirildi");
    } catch (error: any) {
      toast.error("Atama kuralı güncellenemedi", { description: error?.message });
    }
  };

  const removeRule = async () => {
    if (!pendingDelete) return;
    try {
      await leadAssignmentRuleService.remove(pendingDelete.id);
      setPendingDelete(null);
      await load();
      toast.success("Atama kuralı silindi");
    } catch (error: any) {
      toast.error("Atama kuralı silinemedi", { description: error?.message });
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.assigneeUserIds.length) {
      toast.error("Kural adı ve en az bir satış kullanıcısı zorunlu");
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      priority: Math.max(0, Number(form.priority) || 100),
      active: editing?.active ?? true,
      divisionId: form.divisionId === "all" ? null : form.divisionId,
      criteria: {
        cities: csv(form.cities),
        productTerms: csv(form.products),
        sourceCodes: csv(form.sources),
      },
      assigneeUserIds: form.assigneeUserIds,
    };
    try {
      if (editing) await leadAssignmentRuleService.update(editing.id, body);
      else await leadAssignmentRuleService.create(body);
      setOpen(false);
      await load();
      toast.success(editing ? "Atama kuralı güncellendi" : "Atama kuralı oluşturuldu");
    } catch (error: any) {
      toast.error("Atama kuralı kaydedilemedi", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden border-primary/15">
        <div className="h-1 bg-[linear-gradient(90deg,#0b2453_0%,#2457D6_72%,#CF060C_72%)]" />
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="inline-flex items-center gap-2 font-display text-xl"><GitBranch className="size-5 text-primary" /> Lead atama kuralları</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Bölüm, şehir, ürün ve kaynağa göre aktif satış kullanıcılarına round-robin dağıtım.</p>
          </div>
          <Button type="button" size="sm" className="gap-1.5" onClick={showCreate}><Plus className="size-4" /> Kural ekle</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <div className="text-sm text-muted-foreground">Kurallar yükleniyor…</div>}
          {!loading && rules.map((rule) => (
            <div key={rule.id} className="grid gap-3 rounded-lg border border-border/70 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">{rule.name}</div>
                  <Badge variant="outline">Öncelik {rule.priority}</Badge>
                  <Badge className={rule.active ? "bg-emerald-700" : "bg-slate-500"}>{rule.active ? "Aktif" : "Pasif"}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[
                    rule.criteria.cities.length ? `Şehir: ${rule.criteria.cities.join(", ")}` : null,
                    rule.criteria.productTerms.length ? `Ürün: ${rule.criteria.productTerms.join(", ")}` : null,
                    rule.criteria.sourceCodes.length ? `Kaynak: ${rule.criteria.sourceCodes.join(", ")}` : null,
                  ].filter(Boolean).join(" · ") || "Tüm leadler"}
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <UsersRound className="size-3.5" />
                  {rule.assigneeUserIds.map((id) => users.find((candidate) => candidate.id === id)?.name ?? id.slice(0, 8)).join(" → ")}
                </div>
              </div>
              <div className="flex gap-2 sm:gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-8" onClick={() => void toggleRule(rule)}>
                  <RotateCw className="size-4" /><span className="sr-only">{rule.active ? "Kuralı pasifleştir" : "Kuralı aktifleştir"}</span>
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-8" onClick={() => showEdit(rule)}>
                  <Pencil className="size-4" /><span className="sr-only">Kuralı düzenle</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 text-destructive sm:size-8"
                  onClick={() => setPendingDelete(rule)}
                >
                  <Trash2 className="size-4" /><span className="sr-only">Kuralı sil</span>
                </Button>
              </div>
            </div>
          ))}
          {!loading && !rules.length && <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Henüz atama kuralı yok. Yeni leadler sahipsiz havuzda kalır.</div>}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Lead atama kuralını düzenle" : "Yeni lead atama kuralı"}</DialogTitle>
            <DialogDescription>Boş bırakılan kriter tüm değerlerle eşleşir. Düşük öncelik numarası önce çalışır.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
            <div><Label htmlFor="assignment-name">Kural adı</Label><Input id="assignment-name" className="mt-1.5" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={255} /></div>
            <div><Label htmlFor="assignment-priority">Öncelik</Label><Input id="assignment-priority" type="number" min={0} max={10000} className="mt-1.5" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} /></div>
          </div>
          <div>
            <Label>Bölüm</Label>
            <Select
              value={form.divisionId}
              onValueChange={(value) => setForm((current) => ({
                ...current,
                divisionId: value,
                assigneeUserIds: value === "all"
                  ? current.assigneeUserIds
                  : current.assigneeUserIds.filter((id) =>
                      salesUsers.find((candidate) => candidate.id === id)?.divisionIds?.includes(value)
                    ),
              }))}
            >
              <SelectTrigger className="mt-1.5" aria-label="Atama kuralı bölümü"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm bölümler</SelectItem>
                {(user?.divisions ?? []).map((division) => <SelectItem key={division.id} value={division.id}>{division.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label htmlFor="assignment-cities">Şehirler</Label><Input id="assignment-cities" className="mt-1.5" value={form.cities} onChange={(event) => setForm((current) => ({ ...current, cities: event.target.value }))} placeholder="Bursa, İstanbul" /></div>
            <div><Label htmlFor="assignment-products">Ürün terimleri</Label><Input id="assignment-products" className="mt-1.5" value={form.products} onChange={(event) => setForm((current) => ({ ...current, products: event.target.value }))} placeholder="CNC, torna" /></div>
            <div><Label htmlFor="assignment-sources">Kaynak kodları</Label><Input id="assignment-sources" className="mt-1.5" value={form.sources} onChange={(event) => setForm((current) => ({ ...current, sources: event.target.value }))} placeholder="website, fair" /></div>
          </div>
          <div>
            <Label>Round-robin satış kullanıcıları</Label>
            <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
              {selectableSalesUsers.map((candidate) => {
                const checked = form.assigneeUserIds.includes(candidate.id);
                return (
                  <label key={candidate.id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-muted/50">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => setForm((current) => ({
                        ...current,
                        assigneeUserIds: next
                          ? [...current.assigneeUserIds, candidate.id]
                          : current.assigneeUserIds.filter((id) => id !== candidate.id),
                      }))}
                    />
                    <span className="text-sm">{candidate.name}</span>
                  </label>
                );
              })}
              {!selectableSalesUsers.length && <div className="text-sm text-muted-foreground">Bu bölümde aktif satış kullanıcısı bulunamadı.</div>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Kaydediliyor…" : "Kuralı kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atama kuralı silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.name}” yeni leadlerde artık çalışmayacak. Mevcut lead sahipleri değişmeyecek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void removeRule()}>
              Kuralı sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
