import { useMemo, useState } from "react";
import { Building2, CalendarDays, Cpu, MapPin, Search, Shapes } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useStore } from "../../lib/store";
import { EmptyState } from "../shared/EmptyState";
import { EntityVisual, InsightStat } from "../shared/PremiumPrimitives";
import { ViewToggle, type ListView } from "../ui/list-controls";
import { usePersistentState } from "../../lib/persist";
import { cncReferences } from "../../lib/referenceData";

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
};

export function ReferencesPage() {
  const { products, machines, customers, closedCases } = useStore();
  const [q, setQ] = useState("");
  const [view, setView] = usePersistentState<ListView>("references.view", "cards");

  const rows = useMemo(() => {
    const imageByModel = new Map(
      products.map((product) => [product.model.toLocaleLowerCase("tr-TR"), product.imageUrl]),
    );
    const catalogRows = [...cncReferences]
      .map((entry) => ({
        id: `ref-${entry.no}`,
        no: entry.no,
        firm: entry.firm || "—",
        contact: entry.contact || "—",
        district: entry.district || "—",
        city: entry.city || "—",
        brand: entry.brand || "—",
        model: entry.model || "—",
        imageUrl: imageByModel.get(entry.model.toLocaleLowerCase("tr-TR")),
        deliveryDate: entry.deliveryDate,
      }))
      .sort((a, b) => a.no - b.no);

    const nextNo = catalogRows.reduce((max, row) => Math.max(max, row.no), 0);
    const wonOpportunityIds = new Set(
      closedCases
        .filter((salesCase) => salesCase.qualificationStage === "win")
        .map((salesCase) => salesCase.id),
    );
    const liveRows = machines
      .filter((machine) => wonOpportunityIds.has(machine.salesCaseId))
      .map((machine, index) => {
        const company = customers.find(
          (item) => item.id === (machine.initialCustomerId || machine.customerId),
        );
        return {
          id: `device-${machine.id}`,
          no: nextNo + index + 1,
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

    return [...catalogRows, ...liveRows];
  }, [closedCases, customers, machines, products]);

  const filtered = rows.filter((row) => {
    const needle = q.toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return [row.firm, row.contact, row.district, row.city, row.brand, row.model]
      .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle));
  });

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
                <div>
                  <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-operation-blue">Teslim edilmiş makine</div>
                  <h3 className="mt-1 truncate font-display text-xl font-semibold leading-none">{row.model}</h3>
                  <div className="mt-1 font-data text-[10px] text-muted-foreground">{row.brand}</div>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{row.no}</TableCell>
                  <TableCell className="font-medium">{row.firm}</TableCell>
                  <TableCell>{row.contact}</TableCell>
                  <TableCell className="text-muted-foreground">{row.district}</TableCell>
                  <TableCell className="text-muted-foreground">{row.city}</TableCell>
                  <TableCell>{row.brand}</TableCell>
                  <TableCell className="font-data">{row.model}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.deliveryDate)}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                    Referans kaydı bulunamadı.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      )}
    </div>
  );
}
