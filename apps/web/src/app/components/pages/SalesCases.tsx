import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Search, ArrowUpDown, Building2, MoreHorizontal, CheckCircle2, RotateCcw, AlertTriangle, CalendarClock, Cpu } from "lucide-react";
import { SalesCase, salesStageLabel } from "../../lib/mock";
import { StatusBadge } from "../Layout";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../lib/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { KanbanPage } from "./Kanban";
import { FilterPopover, usePaged, Pager } from "../ui/list-controls";
import { ExportExcelButton } from "../ui/ExportExcelButton";
import { LeadCaptureDialog } from "../dialogs/LeadCaptureDialog";
import { TrelloCsvImportDialog } from "../dialogs/TrelloCsvImportDialog";
import { type OperationAction, type OperationFocus } from "../../lib/operations";
import {
  LEAD_TEMPERATURE_HINTS,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURE_ORDER,
  LEAD_TEMPERATURE_STYLES,
} from "../../lib/mock";
import { EntityVisual } from "../shared/PremiumPrimitives";
import { EmptyState } from "../shared/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";

const initials = (n: string) => (n || "—").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const salesCasePartyName = (salesCase: SalesCase, company?: { name?: string } | null) =>
  company?.name ||
  salesCase.externalMetadata?.candidate?.companyTitle ||
  salesCase.leadCompanyTitle ||
  salesCase.leadContactName ||
  "Firma kaydı bekliyor";

export function SalesCasesPage({
  onSelect,
  initialView = "list",
  focus,
  onAction,
}: {
  onSelect: (s: SalesCase) => void;
  initialView?: "list" | "kanban";
  focus?: OperationFocus;
  onAction?: (action: OperationAction) => void;
}) {
  const { cases: salesCases, closedCases, customers, users, activities, products, closeCase, reopenCase } = useStore();
  const [view, setView] = useState<"list" | "kanban" | "archive">(initialView);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<SalesCase | null>(null);

  const onClose = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await closeCase(id);
      setPendingClose(null);
    } finally {
      setBusyId(null);
    }
  };
  const onReopen = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await reopenCase(id);
    } finally {
      setBusyId(null);
    }
  };
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [companyResolution, setCompanyResolution] = useState("all");
  const [temperature, setTemperature] = useState("all");
  const [nameSort, setNameSort] = useState<"asc" | "desc" | null>(null);

  const focusOpen = focus === "open" || focus === "today";
  const focusWon = focus === "won";
  const focusLost = focus === "lost";
  const filtered = salesCases.filter((s) => {
    if (focusOpen && (s.isLost || ["Completed", "Lost", "delivered"].includes(String(s.stage)))) return false;
    if (focusWon && !["Completed", "delivered"].includes(String(s.stage))) return false;
    if (focusLost && !(s.isLost || String(s.stage) === "Lost")) return false;
    if (stage !== "all" && s.stage !== stage) return false;
    if (currency !== "all" && s.currency !== currency) return false;
    if (companyResolution === "pending" && s.customerId) return false;
    if (companyResolution === "resolved" && !s.customerId) return false;
    if (temperature !== "all" && (s.leadTemperature ?? "unknown") !== temperature) return false;
    const c = customers.find((x) => x.id === s.customerId);
    const query = q.toLocaleLowerCase("tr-TR");
    return [
      c?.name,
      s.leadCompanyTitle,
      s.leadContactName,
      s.leadContactValue,
      s.leadPhone,
      s.leadEmail,
      s.leadCity,
      s.externalMetadata?.candidate?.companyTitle,
      s.requestedProduct,
    ].some((value) => (value ?? "").toLocaleLowerCase("tr-TR").includes(query));
  });

  const sorted = useMemo(() => {
    if (!nameSort) return filtered;
    return [...filtered].sort((a, b) => {
      const an = salesCasePartyName(a, customers.find((x) => x.id === a.customerId)).localeCompare(
        salesCasePartyName(b, customers.find((x) => x.id === b.customerId)),
        "tr"
      );
      return nameSort === "asc" ? an : -an;
    });
  }, [filtered, nameSort, customers]);

  const { page, setPage, totalPages, pageItems } = usePaged(sorted, 12);

  const stageOptions = Array.from(new Set(salesCases.map((s) => s.stage))).map((v) => ({ value: v, label: salesStageLabel(v) }));
  const currencyOptions = Array.from(new Set(salesCases.map((s) => s.currency))).map((v) => ({ value: v, label: v }));

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (focusOpen || focusWon || focusLost) setStage("all");
  }, [focusLost, focusOpen, focusWon]);

  const exportParams = {
    ...(q ? { search: q } : {}),
    ...(stage !== "all" ? { stageCode: stage } : {}),
  };
  const nextActivityFor = (salesCaseId: string) => activities
    .filter((activity) => activity.salesCaseId === salesCaseId && new Date(activity.date).getTime() >= Date.now() - 86_400_000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const riskFor = (salesCase: SalesCase) => {
    if (salesCase.isLost || String(salesCase.stage) === "Lost") return { label: "Kaybedildi", className: "border-destructive/20 bg-destructive-soft text-destructive" };
    const age = Math.floor((Date.now() - new Date(salesCase.createdAt).getTime()) / 86_400_000);
    if (!salesCase.assignedUserId) return { label: "Sahipsiz", className: "border-destructive/20 bg-destructive-soft text-destructive" };
    if (!nextActivityFor(salesCase.id) && age > 30) return { label: "Takipsiz", className: "border-warning/20 bg-warning-soft text-warning" };
    if (!salesCase.isOfferPrepared && age > 14) return { label: "Teklif bekliyor", className: "border-warning/20 bg-warning-soft text-warning" };
    return { label: "Akışta", className: "border-success/20 bg-success-soft text-success" };
  };

  return (
    <Tabs value={view} onValueChange={(v) => setView(v as "list" | "kanban" | "archive")} className="space-y-4">
      <TabsList>
        <TabsTrigger value="list">Liste</TabsTrigger>
        <TabsTrigger value="kanban">Kanban</TabsTrigger>
        <TabsTrigger value="archive">Geçmiş{closedCases.length ? ` (${closedCases.length})` : ""}</TabsTrigger>
      </TabsList>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Firma / kontak / ürün ara..."
              className="pl-9 h-9 bg-white"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <FilterPopover
            filters={[
              { label: "Aşama", value: stage, onChange: setStage, options: stageOptions },
              { label: "Para Birimi", value: currency, onChange: setCurrency, options: currencyOptions },
              {
                label: "Firma Kararı",
                value: companyResolution,
                onChange: setCompanyResolution,
                options: [
                  { value: "pending", label: "Firma kararı bekliyor" },
                  { value: "resolved", label: "Firma bağlı" },
                ],
              },
              {
                label: "Alım Niyeti",
                value: temperature,
                onChange: setTemperature,
                options: LEAD_TEMPERATURE_ORDER.map((code) => ({
                  value: code,
                  label: `${LEAD_TEMPERATURE_LABELS[code]} · ${LEAD_TEMPERATURE_HINTS[code]}`,
                })),
              },
            ]}
          />
          {focusOpen && (
            <span className="inline-flex h-8 items-center rounded-md border border-primary/20 bg-primary/10 px-2.5 text-xs text-primary">
              Açık kartlar
            </span>
          )}
          {focusWon && (
            <span className="inline-flex h-8 items-center rounded-md border border-emerald-200 bg-success-soft px-2.5 text-xs text-success">
              Kazanılanlar
            </span>
          )}
          {focusLost && (
            <span className="inline-flex h-8 items-center rounded-md border border-red-200 bg-destructive-soft px-2.5 text-xs text-destructive">
              Kaybedilenler
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <LeadCaptureDialog />
          <TrelloCsvImportDialog />
          <ExportExcelButton path="/exports/opportunities" filename="satis-kartlari.xlsx" params={exportParams} className="h-9" />
        </div>
      </div>

      <TabsContent value="kanban" className="mt-0">
        <KanbanPage onSelect={onSelect} items={sorted} onAction={onAction} />
      </TabsContent>
      <TabsContent value="list" className="mt-0 space-y-4">

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="sticky left-0 z-20 w-[320px] min-w-[320px] bg-muted">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => setNameSort((s) => (s === "asc" ? "desc" : "asc"))}
                    aria-label="Firma veya kontağa göre sırala"
                  >
                    Firma / Kontak <ArrowUpDown className="size-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Aşama</TableHead>
                <TableHead>Risk / Sıradaki</TableHead>
                <TableHead className="hidden sm:table-cell">Atanan</TableHead>
                <TableHead className="hidden md:table-cell">Açılış</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((s) => {
                const c = customers.find((x) => x.id === s.customerId);
                const u = users.find((x) => x.id === s.assignedUserId);
                const product = products.find((item) => item.model === s.requestedModel || item.modelName === s.requestedModel);
                const nextActivity = nextActivityFor(s.id);
                const risk = riskFor(s);
                const partyName = salesCasePartyName(s, c);
                const temp = s.leadTemperature ?? "unknown";
                const contactLine =
                  [s.leadContactMethodName, s.leadPhone, s.leadEmail].filter(Boolean).join(" · ") ||
                  [s.leadContactMethodName, s.leadContactValue].filter(Boolean).join(" · ");
                return (
                  <TableRow key={s.id} className="cursor-pointer group" onClick={() => onSelect(s)}>
                    <TableCell className="sticky left-0 z-10 border-r border-border/60 bg-white group-hover:bg-[#f8f9fc]">
                      <div className="flex items-center gap-3 min-w-0">
                        <EntityVisual size="sm" title={s.requestedModel || s.requestedProduct} imageUrl={product?.imageUrl} icon={<Cpu className="size-4" />} />
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <div className="truncate text-sm font-semibold leading-tight transition-colors group-hover:text-primary">{partyName}</div>
                            {!c && <span className="shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-[9px] text-warning">Lead</span>}
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${LEAD_TEMPERATURE_STYLES[temp].badge}`}
                              title={`Alım niyeti: ${LEAD_TEMPERATURE_HINTS[temp]}`}
                            >
                              <span className={`size-1.5 rounded-full ${LEAD_TEMPERATURE_STYLES[temp].dot}`} />
                              {LEAD_TEMPERATURE_LABELS[temp]}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {s.leadContactName && s.leadContactName !== partyName ? `${s.leadContactName} · ` : ""}
                            {s.requestedProduct} · {s.requestedModel} · {s.quantity} adet
                          </div>
                          {contactLine && (
                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{contactLine}</div>
                          )}
                          {(s.leadCity || c?.city) && (
                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{c?.city ?? s.leadCity}</div>
                          )}
                          <div className="font-data text-[9px] uppercase tracking-wide text-muted-foreground/80">#{s.id.toUpperCase()}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="font-display text-lg font-semibold text-primary">{s.estimatedAmount.toLocaleString("tr-TR")}</span>{" "}
                      <span className="text-[11px] text-muted-foreground">{s.currency}</span>
                    </TableCell>
                    <TableCell><StatusBadge status={s.stage} /></TableCell>
                    <TableCell>
                      <div className="min-w-[160px]"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${risk.className}`}><AlertTriangle className="mr-1 size-3" />{risk.label}</span><div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground"><CalendarClock className="size-3.5" />{nextActivity ? `${nextActivity.title} · ${new Date(nextActivity.date).toLocaleDateString("tr-TR")}` : "Sonraki aktivite planlanmamış"}</div></div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarFallback className="bg-primary/15 text-primary text-[10px]">{initials(u?.name ?? "—")}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{(u?.name ?? "Atanmadı").split(" ")[0]}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground tabular-nums">{s.createdAt}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {(s.stage === "delivered" || s.isLost) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-success hover:text-emerald-800 hover:bg-success-soft"
                            disabled={busyId === s.id}
                            title="Tamamla / Arşivle (silmez, Geçmiş'te kalır)"
                            onClick={() => setPendingClose(s)}
                          >
                            <CheckCircle2 className="size-3.5" /> Bitir
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="Detay" onClick={() => onSelect(s)}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageItems.length === 0 && <TableRow><TableCell colSpan={7} className="py-4"><EmptyState scene="search" title="Satış kartı bulunamadı" description="Arama veya filtreleri değiştirerek tekrar deneyin." /></TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            Toplam <b className="text-foreground">{filtered.length}</b> satış kartı
          </div>
          <Pager page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      </Card>
      </TabsContent>

      <TabsContent value="archive" className="mt-0 space-y-4">
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[280px]">Müşteri</TableHead>
                  <TableHead>Ürün / Model</TableHead>
                  <TableHead>Sonuç</TableHead>
                  <TableHead>Kapanış</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedCases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                      Arşivlenmiş (tamamlanmış/iptal) kart yok. Teslim edilen veya iptal edilen bir kartta "Bitir" deyince burada birikir.
                    </TableCell>
                  </TableRow>
                ) : (
                  closedCases.map((s) => {
                    const c = customers.find((x) => x.id === s.customerId);
                    return (
                      <TableRow key={s.id} className="cursor-pointer group" onClick={() => onSelect(s)}>
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-8 rounded-md bg-muted text-muted-foreground grid place-items-center shrink-0">
                              <Building2 className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{salesCasePartyName(s, c)}</div>
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">#{s.id.toUpperCase()}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><div className="text-sm">{s.requestedProduct}</div></TableCell>
                        <TableCell><StatusBadge status={s.stage} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{s.closedAt ?? "—"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            disabled={busyId === s.id}
                            title="Geri Aç (aktif panoya döndür)"
                            onClick={() => onReopen(s.id)}
                          >
                            <RotateCcw className="size-3.5" /> Geri Aç
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60 bg-muted/20">
            <div className="text-xs text-muted-foreground">
              Toplam <b className="text-foreground">{closedCases.length}</b> arşiv kartı (teslim + iptal) · silinmedi, DB'de duruyor
            </div>
          </div>
        </Card>
      </TabsContent>

      <AlertDialog open={!!pendingClose} onOpenChange={(open) => !open && !busyId && setPendingClose(null)}>
        <AlertDialogContent className="max-w-lg"><AlertDialogHeader><AlertDialogTitle>Satış kartı tamamlanıp arşivlensin mi?</AlertDialogTitle><AlertDialogDescription><span className="block font-medium text-foreground">{pendingClose ? salesCasePartyName(pendingClose, customers.find((customer) => customer.id === pendingClose.customerId)) : "Satış kartı"} · {pendingClose?.requestedModel || pendingClose?.requestedProduct}</span>Kart silinmez; “Geçmiş” görünümüne taşınır. Teklif, proforma, sözleşme ve aktiviteler korunur.</AlertDialogDescription></AlertDialogHeader>{pendingClose && <div className="rounded-lg border border-primary/10 bg-brand-blue-soft/50 p-3 text-xs"><div className="font-display text-lg font-semibold text-primary">{pendingClose.estimatedAmount.toLocaleString("tr-TR")} {pendingClose.currency}</div><div className="mt-1 text-muted-foreground">Aşama: {salesStageLabel(pendingClose.stage)}</div></div>}<AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction disabled={!!busyId} onClick={(event) => { event.preventDefault(); if (pendingClose) void onClose(pendingClose.id); }}>{busyId ? "Arşivleniyor…" : "Tamamla ve Arşivle"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}
