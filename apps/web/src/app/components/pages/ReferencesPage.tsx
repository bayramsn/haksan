import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, Cpu, MapPin, Pencil, Plus, Search, Shapes, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { referenceService, type ReferenceDTO } from "../../../lib/services";
import { EmptyState } from "../shared/EmptyState";
import { EntityVisual, InsightStat } from "../shared/PremiumPrimitives";
import { ViewToggle, type ListView } from "../ui/list-controls";
import { usePersistentState } from "../../lib/persist";

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
};

const emptyForm = () => ({
  firm: "",
  contact: "",
  district: "",
  city: "",
  brand: "",
  model: "",
  deliveryDate: "",
  notes: "",
});

type ReferenceForm = ReturnType<typeof emptyForm>;

const formFromRecord = (record: ReferenceDTO): ReferenceForm => ({
  firm: record.firm ?? "",
  contact: record.contact ?? "",
  district: record.district ?? "",
  city: record.city ?? "",
  brand: record.brand ?? "",
  model: record.model ?? "",
  deliveryDate: record.deliveryDate?.slice(0, 10) ?? "",
  notes: record.notes ?? "",
});

export function ReferencesPage() {
  const { products, machines, customers, closedCases } = useStore();
  const { hasPermission } = useAuth();
  const [q, setQ] = useState("");
  const [view, setView] = usePersistentState<ListView>("references.view", "cards");
  const [records, setRecords] = useState<ReferenceDTO[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReferenceDTO | null>(null);
  const [form, setForm] = useState<ReferenceForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ReferenceDTO | null>(null);

  const canCreate = hasPermission("companies.create");
  const canUpdate = hasPermission("companies.update");
  const canDelete = hasPermission("companies.delete");

  const load = useCallback(async () => {
    try {
      setRecords(await referenceService.list());
    } catch (err: any) {
      toast.error("Referanslar yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (record: ReferenceDTO) => {
    setEditing(record);
    setForm(formFromRecord(record));
    setDialogOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.firm.trim()) return toast.error("Firma adı zorunludur");
    setSaving(true);
    try {
      const payload = {
        firm: form.firm.trim(),
        contact: form.contact.trim() || undefined,
        district: form.district.trim() || undefined,
        city: form.city.trim() || undefined,
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        deliveryDate: form.deliveryDate || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        await referenceService.update(editing.id, payload);
        toast.success("Referans güncellendi", { description: payload.firm });
      } else {
        await referenceService.create(payload);
        toast.success("Referans eklendi", { description: payload.firm });
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast.error("Referans kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await referenceService.remove(deleting.id);
      toast.success("Referans silindi", { description: deleting.firm });
      setDeleting(null);
      await load();
    } catch (err: any) {
      toast.error("Referans silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  const rows = useMemo(() => {
    const imageByModel = new Map(
      products.map((product) => [product.model.toLocaleLowerCase("tr-TR"), product.imageUrl]),
    );
    // Elle girilen referanslar düzenlenebilir; kazanılan fırsatlardan türeyenler
    // makine kaydının kopyası olduğu için salt okunurdur.
    const manualRows = records.map((record) => ({
      id: `ref-${record.id}`,
      record,
      firm: record.firm || "—",
      contact: record.contact || "—",
      district: record.district || "—",
      city: record.city || "—",
      brand: record.brand || "—",
      model: record.model || "—",
      imageUrl: imageByModel.get((record.model ?? "").toLocaleLowerCase("tr-TR")),
      deliveryDate: record.deliveryDate ?? undefined,
    }));

    const wonOpportunityIds = new Set(
      closedCases
        .filter((salesCase) => salesCase.qualificationStage === "win")
        .map((salesCase) => salesCase.id),
    );
    const liveRows = machines
      .filter((machine) => wonOpportunityIds.has(machine.salesCaseId))
      .map((machine) => {
        const company = customers.find(
          (item) => item.id === (machine.initialCustomerId || machine.customerId),
        );
        return {
          id: `device-${machine.id}`,
          record: null,
          firm: company?.name || "—",
          contact: company?.contactPerson || "—",
          district: company?.district || "—",
          city: company?.city || "—",
          brand: machine.brand || "—",
          model: machine.model || "—",
          imageUrl: imageByModel.get(machine.model.toLocaleLowerCase("tr-TR")),
          deliveryDate: machine.deliveryDate || machine.installationDate,
        };
      });

    return [...manualRows, ...liveRows];
  }, [closedCases, customers, machines, products, records]);

  const filtered = rows.filter((row) => {
    const needle = q.toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return [row.firm, row.contact, row.district, row.city, row.brand, row.model]
      .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle));
  });

  const rowActions = (row: (typeof rows)[number], compact = false) => {
    if (!row.record) {
      return <Badge variant="outline" className="h-6 shrink-0 text-[9px]">Otomatik</Badge>;
    }
    return (
      <div className="flex items-center gap-1">
        {canUpdate && (
          <Button
            variant="ghost"
            size="icon"
            className={compact ? "size-7" : "size-8"}
            aria-label={`${row.firm} referansını düzenle`}
            onClick={() => openEdit(row.record!)}
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className={compact ? "size-7" : "size-8"}
            aria-label={`${row.firm} referansını sil`}
            onClick={() => setDeleting(row.record!)}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="premium-blueprint overflow-hidden border-border/75">
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <InsightStat label="Teslim edilen" value={rows.length} detail="makine referansı" icon={<Cpu className="size-3.5" />} />
          <InsightStat label="Firma" value={new Set(rows.map((row) => row.firm)).size} detail="aktif referans" icon={<Building2 className="size-3.5" />} />
          <InsightStat label="Şehir" value={new Set(rows.map((row) => row.city).filter((city) => city !== "—")).size} detail="saha kapsamı" icon={<MapPin className="size-3.5" />} tone="success" />
          <InsightStat label="Marka" value={new Set(rows.map((row) => row.brand).filter((brand) => brand !== "—")).size} detail="tezgah portföyü" icon={<Shapes className="size-3.5" />} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-border/70 bg-white p-3 shadow-xs">
        <div className="min-w-0">
          <div className="font-data text-[9px] font-semibold uppercase tracking-[0.15em] text-operation-blue">Saha portföyü</div>
          <div className="mt-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filtered.length}</span> teslim edilmiş makine
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-80">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Firma, il, marka veya model ara..."
            className="h-9 pl-9 bg-white"
          />
          </div>
          <ViewToggle view={view} onChange={setView} />
          {canCreate && (
            <Button className="h-9 gap-1.5" onClick={openCreate}>
              <Plus className="size-4" /> Yeni Referans
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="overflow-hidden border-border/70">
          <EmptyState scene="search" eyebrow="Referans araması" title="Eşleşen referans bulunamadı" description="Firma, şehir, marka veya model bilgisini değiştirerek tekrar deneyin." />
        </Card>
      ) : view === "cards" ? (
        <div className="surface-enter grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((row) => (
            <Card key={row.id} className="group overflow-hidden border-border/75 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
              <EntityVisual imageUrl={row.imageUrl} title={`${row.brand} ${row.model}`} overline={row.brand} icon={<Cpu className="size-7" />} size="lg" className="m-3 mb-0 h-36 w-auto" />
              <CardContent className="space-y-3 p-4 pt-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-operation-blue">Teslim edilmiş makine</div>
                    <h3 className="mt-1 truncate font-display text-xl font-semibold leading-none">{row.model}</h3>
                    <div className="mt-1 font-data text-[10px] text-muted-foreground">{row.brand}</div>
                  </div>
                  {rowActions(row, true)}
                </div>
                <div className="border-y border-border/60 py-2.5">
                  <div className="truncate text-[12px] font-semibold text-foreground">{row.firm}</div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin className="size-3" /> {[row.district, row.city].filter((value) => value !== "—").join(" / ") || "Konum belirtilmedi"}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">İlgili</div>
                    <div className="mt-0.5 truncate text-[11px] font-medium">{row.contact}</div>
                  </div>
                  <Badge variant="outline" className="h-6 shrink-0 gap-1 text-[9px]"><CalendarDays className="size-3" /> {formatDate(row.deliveryDate)}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
      <Card className="surface-enter border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-16">No</TableHead>
                <TableHead className="min-w-[220px]">Firma</TableHead>
                <TableHead>İlgili</TableHead>
                <TableHead>İlçe</TableHead>
                <TableHead>İl</TableHead>
                <TableHead>Tezgah Markası</TableHead>
                <TableHead>Tezgah Modeli</TableHead>
                <TableHead>Teslim Tarihi</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{row.firm}</TableCell>
                  <TableCell>{row.contact}</TableCell>
                  <TableCell className="text-muted-foreground">{row.district}</TableCell>
                  <TableCell className="text-muted-foreground">{row.city}</TableCell>
                  <TableCell>{row.brand}</TableCell>
                  <TableCell className="font-data">{row.model}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.deliveryDate)}</TableCell>
                  <TableCell>{rowActions(row)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Referansı Düzenle" : "Yeni Referans"}</DialogTitle>
            <DialogDescription>Teslim edilmiş makineyi satış referansı olarak kaydedin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-xs" htmlFor="reference-firm">Firma *</Label>
              <Input id="reference-firm" className="mt-1.5" value={form.firm} onChange={(event) => setForm({ ...form, firm: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs" htmlFor="reference-contact">İlgili</Label>
                <Input id="reference-contact" className="mt-1.5" value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} />
              </div>
              <div>
                <Label className="text-xs" htmlFor="reference-district">İlçe</Label>
                <Input id="reference-district" className="mt-1.5" value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} />
              </div>
              <div>
                <Label className="text-xs" htmlFor="reference-city">İl</Label>
                <Input id="reference-city" className="mt-1.5" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs" htmlFor="reference-brand">Tezgah Markası</Label>
                <Input id="reference-brand" className="mt-1.5" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
              </div>
              <div>
                <Label className="text-xs" htmlFor="reference-model">Tezgah Modeli</Label>
                <Input id="reference-model" className="mt-1.5" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
              </div>
              <div>
                <Label className="text-xs" htmlFor="reference-delivery">Teslim Tarihi</Label>
                <Input id="reference-delivery" type="date" className="mt-1.5" value={form.deliveryDate} onChange={(event) => setForm({ ...form, deliveryDate: event.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs" htmlFor="reference-notes">Notlar</Label>
              <Textarea id="reference-notes" className="mt-1.5" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Vazgeç</Button>
              <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : editing ? "Kaydet" : "Referans Ekle"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Referansı sil</DialogTitle>
            <DialogDescription>{deleting?.firm} referansı listeden kaldırılacak.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Vazgeç</Button>
            <Button variant="destructive" onClick={confirmDelete}>Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
