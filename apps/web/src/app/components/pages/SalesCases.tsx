import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Search, ArrowUpDown, Building2, MoreHorizontal, CheckCircle2, RotateCcw, AlertTriangle, CalendarClock, Cpu, Trash2 } from "lucide-react";
import {
  QUALIFICATION_STAGE_LABELS,
  QUALIFICATION_STAGES,
  SalesCase,
  salesStageLabel,
  type QualificationStage,
} from "../../lib/mock";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { QualificationKanban } from "./QualificationKanban";
import { FilterPopover, usePaged, Pager } from "../ui/list-controls";
import { ExportExcelButton } from "../ui/ExportExcelButton";
import { type OperationAction, type OperationFocus } from "../../lib/operations";
import { EntityVisual } from "../shared/PremiumPrimitives";
import { EmptyState } from "../shared/EmptyState";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
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

const qualificationStyle: Record<QualificationStage, string> = {
  lead: "border-slate-200 bg-slate-50 text-slate-700",
  c: "border-slate-200 bg-slate-50 text-slate-700",
  b: "border-blue-200 bg-blue-50 text-blue-700",
  a: "border-indigo-200 bg-indigo-50 text-indigo-700",
  a_plus: "border-amber-200 bg-amber-50 text-amber-700",
  win: "border-emerald-200 bg-emerald-50 text-emerald-700",
  lost: "border-red-200 bg-red-50 text-red-700",
};

const QualificationBadge = ({ stage }: { stage: QualificationStage }) => (
  <Badge variant="outline" className={`font-data text-[10px] ${qualificationStyle[stage]}`}>
    {QUALIFICATION_STAGE_LABELS[stage]}
  </Badge>
);

export function SalesCasesPage({
  onSelect,
  initialView = "list",
  focus,
  initialQuery,
}: {
  onSelect: (s: SalesCase) => void;
  initialView?: "list" | "kanban";
  focus?: OperationFocus;
  initialQuery?: string;
  onAction?: (action: OperationAction) => void;
}) {
  const { cases: salesCases, closedCases, customers, users, activities, products, closeCase, deleteCase, reopenCase, updateCase } = useStore();
  const { hasPermission, hasRole } = useAuth();
  const canDelete = hasPermission("opportunities.delete");
  const canUpdate = hasPermission("opportunities.update");
  const canAssignOwner = hasRole("sales") || hasRole("super_admin");
  const canReopenLost = canAssignOwner && canUpdate;
  const [view, setView] = useState<"list" | "kanban" | "archive">(initialView);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<SalesCase | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SalesCase | null>(null);

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
      toast.success("Fırsat önceki derecesine geri açıldı", {
        description: "Kart ve kayıp bilgileri korunarak fırsat panosuna alındı.",
      });
    } catch (error: any) {
      toast.error("Fırsat geri açılamadı", {
        description: error?.message ?? "İstek başarısız oldu.",
      });
    } finally {
      setBusyId(null);
    }
  };
  const onDelete = async () => {
    if (!pendingDelete || busyId) return;
    const salesCase = pendingDelete;
    setBusyId(salesCase.id);
    try {
      await deleteCase(salesCase.id);
      setPendingDelete(null);
      toast.success("Fırsat kartı silindi", {
        description: salesCasePartyName(salesCase, customers.find((customer) => customer.id === salesCase.customerId)),
      });
    } catch (error: any) {
      toast.error("Fırsat kartı silinemedi", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setBusyId(null);
    }
  };
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [companyResolution, setCompanyResolution] = useState("all");
  const [nameSort, setNameSort] = useState<"asc" | "desc" | null>(null);

  const focusOpen = focus === "open" || focus === "today";
  const focusWon = focus === "won";
  const focusLost = focus === "lost";
  const showLostDetails = focusLost || stage === "lost";
  const filtered = salesCases.filter((s) => {
    const qualification = s.qualificationStage ?? "lead";
    if (qualification === "lead") return false;
    if (focusOpen && (qualification === "win" || qualification === "lost")) return false;
    if (focusWon && qualification !== "win") return false;
    if (focusLost && qualification !== "lost") return false;
    if (stage !== "all" && qualification !== stage) return false;
    if (currency !== "all" && s.currency !== currency) return false;
    if (companyResolution === "pending" && s.customerId) return false;
    if (companyResolution === "resolved" && !s.customerId) return false;
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
      s.leadDistrict,
      s.externalMetadata?.candidate?.companyTitle,
      s.requestedProduct,
      s.lostProductName,
      s.lostReason,
      s.competitor,
      s.lostCompetitorProductModel,
      s.lostUnmetConditions,
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

  const stageOptions = QUALIFICATION_STAGES.map((value) => ({
    value,
    label: QUALIFICATION_STAGE_LABELS[value],
  }));
  const currencyOptions = Array.from(new Set(salesCases.map((s) => s.currency))).map((v) => ({ value: v, label: v }));
  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (focusOpen || focusWon || focusLost) setStage("all");
  }, [focusLost, focusOpen, focusWon]);

  useEffect(() => {
    if (initialQuery?.startsWith("qualification:")) {
      const next = initialQuery.slice("qualification:".length) as QualificationStage;
      if (QUALIFICATION_STAGES.includes(next)) {
        setStage(next);
      }
    }
  }, [initialQuery]);

  const exportParams = {
    ...(q ? { search: q } : {}),
    ...(stage !== "all" ? { qualificationStage: stage } : {}),
  };
  const nextActivityFor = (salesCaseId: string) => activities
    .filter((activity) => activity.salesCaseId === salesCaseId && new Date(activity.date).getTime() >= Date.now() - 86_400_000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const riskFor = (salesCase: SalesCase) => {
    if (salesCase.qualificationStage === "lost") return { label: "Kaybedildi", className: "border-destructive/20 bg-destructive-soft text-destructive" };
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
          <InputGroup className="w-full bg-card sm:w-72">
            <InputGroupAddon><Search className="size-4" aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput
              placeholder="Firma / kontak / ürün ara..."
              aria-label="Fırsatlarda ara"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </InputGroup>
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
          <ExportExcelButton path="/exports/opportunities" filename="firsatlar.xlsx" params={exportParams} className="h-9" />
        </div>
      </div>

      <TabsContent value="kanban" className="mt-0">
        <QualificationKanban
          onSelect={onSelect}
          items={sorted}
          onRequestDelete={canDelete ? setPendingDelete : undefined}
        />
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
                {showLostDetails && <TableHead className="min-w-[280px]">Kaybedilme Detayı</TableHead>}
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
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {s.leadContactName && s.leadContactName !== partyName ? `${s.leadContactName} · ` : ""}
                            {s.requestedProduct} · {s.requestedModel} · {s.quantity} adet
                          </div>
                          {contactLine && (
                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{contactLine}</div>
                          )}
                          {(s.leadCity || c?.city) && (
                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              {c?.city
                                ? [c.city, c.district].filter(Boolean).join(" / ")
                                : [s.leadCity, s.leadDistrict].filter(Boolean).join(" / ")}
                            </div>
                          )}
                          <div className="font-data text-[9px] uppercase tracking-wide text-muted-foreground/80">#{s.id.toUpperCase()}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="font-display text-lg font-semibold text-primary">{s.estimatedAmount.toLocaleString("tr-TR")}</span>{" "}
                      <span className="text-[11px] text-muted-foreground">{s.currency}</span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <QualificationBadge stage={s.qualificationStage} />
                        <div className="text-[9px] text-muted-foreground">Operasyon: {salesStageLabel(s.stage)}</div>
                      </div>
                    </TableCell>
                    {showLostDetails && (
                      <TableCell>
                        <div className="max-w-[340px] space-y-1 text-[11px]">
                          <div className="font-medium text-foreground">
                            {s.lostProductName || s.requestedMachine || [s.requestedProduct, s.requestedModel].filter(Boolean).join(" · ") || "Ürün belirtilmedi"}
                          </div>
                          <div className="text-destructive">{s.lostReason || s.lostReasonCode || "Kayıp nedeni belirtilmedi"}</div>
                          <div className="text-muted-foreground">
                            Rakip: {[s.competitor, s.lostCompetitorProductModel].filter(Boolean).join(" · ") || "yok / bilinmiyor"}
                          </div>
                          <div className="line-clamp-2 text-muted-foreground">
                            Uymayan şartlar: {s.lostUnmetConditions || s.qualificationNote || "belirtilmedi"}
                          </div>
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="min-w-[160px]"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${risk.className}`}><AlertTriangle className="mr-1 size-3" />{risk.label}</span><div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground"><CalendarClock className="size-3.5" />{nextActivity ? `${nextActivity.title} · ${new Date(nextActivity.date).toLocaleDateString("tr-TR")}` : "Sonraki aktivite planlanmamış"}</div></div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell" onClick={(event) => event.stopPropagation()}>
                      {canAssignOwner ? (
                        <Select
                          value={s.assignedUserId || "__none__"}
                          disabled={busyId === s.id}
                          onValueChange={async (value) => {
                            setBusyId(s.id);
                            try {
                              await updateCase(s.id, { assignedUserId: value === "__none__" ? "" : value });
                              toast.success("Fırsat sorumlusu güncellendi");
                            } catch (error: any) {
                              toast.error("Fırsat sorumlusu güncellenemedi", { description: error?.message });
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          <SelectTrigger size="sm" className="h-8 w-[160px] bg-white text-xs" aria-label={`${partyName} sorumlusu`}>
                            <SelectValue placeholder="Atanmadı" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Atanmadı</SelectItem>
                            {users.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className="bg-primary/15 text-primary text-[10px]">{initials(u?.name ?? "—")}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{(u?.name ?? "Atanmadı").split(" ")[0]}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground tabular-nums">{s.createdAt}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {s.qualificationStage === "lost" && canReopenLost && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            disabled={busyId === s.id}
                            title="LOST fırsatı önceki derecesine döndür"
                            onClick={() => void onReopen(s.id)}
                          >
                            <RotateCcw className="size-3.5" /> Önceki Dereceye Aç
                          </Button>
                        )}
                        {(s.qualificationStage === "win" || s.qualificationStage === "lost") && (
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
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive opacity-100 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                            title="Fırsat kartını sil"
                            aria-label={`${partyName} fırsat kartını sil`}
                            disabled={busyId === s.id}
                            onClick={() => setPendingDelete(s)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageItems.length === 0 && <TableRow><TableCell colSpan={showLostDetails ? 8 : 7} className="py-4"><EmptyState scene="search" title="Fırsat bulunamadı" description="Arama veya filtreleri değiştirerek tekrar deneyin." /></TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            Toplam <b className="text-foreground">{filtered.length}</b> fırsat
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
                  <TableHead className="w-40"></TableHead>
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
                        <TableCell>
                          <div className="text-sm">{s.lostProductName || s.requestedProduct}</div>
                          {s.requestedModel && <div className="mt-0.5 text-[11px] text-muted-foreground">{s.requestedModel}</div>}
                        </TableCell>
                        <TableCell>
                          <QualificationBadge stage={s.qualificationStage} />
                          {s.qualificationStage === "lost" && (
                            <div className="mt-1 max-w-[280px] text-[11px] text-muted-foreground">
                              <div className="text-destructive">{s.lostReason || s.lostReasonCode || "Neden belirtilmedi"}</div>
                              <div>Rakip: {[s.competitor, s.lostCompetitorProductModel].filter(Boolean).join(" · ") || "yok / bilinmiyor"}</div>
                              <div className="line-clamp-2">Uymayan şartlar: {s.lostUnmetConditions || s.qualificationNote || "belirtilmedi"}</div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{s.closedAt ?? "—"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {(s.qualificationStage !== "lost" || canReopenLost) && <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              disabled={busyId === s.id}
                              title={s.qualificationStage === "lost" ? "Önceki fırsat derecesine geri aç" : "Aktif panoya geri aç"}
                              onClick={() => onReopen(s.id)}
                            >
                              <RotateCcw className="size-3.5" /> {s.qualificationStage === "lost" ? "Önceki Dereceye Aç" : "Geri Aç"}
                            </Button>}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Arşivlenmiş fırsat kartını sil"
                                aria-label={`${salesCasePartyName(s, c)} arşivlenmiş fırsat kartını sil`}
                                disabled={busyId === s.id}
                                onClick={() => setPendingDelete(s)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
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
              Toplam <b className="text-foreground">{closedCases.length}</b> arşiv fırsatı (WIN + LOST) · silinmedi, DB'de duruyor
            </div>
          </div>
        </Card>
      </TabsContent>

      <AlertDialog open={!!pendingClose} onOpenChange={(open) => !open && !busyId && setPendingClose(null)}>
        <AlertDialogContent className="max-w-lg"><AlertDialogHeader><AlertDialogTitle>Fırsat tamamlanıp arşivlensin mi?</AlertDialogTitle><AlertDialogDescription><span className="block font-medium text-foreground">{pendingClose ? salesCasePartyName(pendingClose, customers.find((customer) => customer.id === pendingClose.customerId)) : "Fırsat"} · {pendingClose?.requestedModel || pendingClose?.requestedProduct}</span>Kart silinmez; “Geçmiş” görünümüne taşınır. Teklif, proforma, sözleşme ve aktiviteler korunur.</AlertDialogDescription></AlertDialogHeader>{pendingClose && <div className="rounded-lg border border-primary/10 bg-brand-blue-soft/50 p-3 text-xs"><div className="font-display text-lg font-semibold text-primary">{pendingClose.estimatedAmount.toLocaleString("tr-TR")} {pendingClose.currency}</div><div className="mt-1 text-muted-foreground">Derece: {QUALIFICATION_STAGE_LABELS[pendingClose.qualificationStage]}</div></div>}<AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction disabled={!!busyId} onClick={(event) => { event.preventDefault(); if (pendingClose) void onClose(pendingClose.id); }}>{busyId ? "Arşivleniyor…" : "Tamamla ve Arşivle"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && !busyId && setPendingDelete(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Fırsat kartı silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium text-foreground">
                {pendingDelete
                  ? salesCasePartyName(
                      pendingDelete,
                      customers.find((customer) => customer.id === pendingDelete.customerId),
                    )
                  : "Fırsat"}
                {pendingDelete ? ` · ${pendingDelete.requestedModel || pendingDelete.requestedProduct}` : ""}
              </span>
              Kart aktif ve geçmiş görünümlerinden kaldırılacak. Bağlı teklif, aktivite ve denetim kayıtları veri bütünlüğü için korunur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(busyId)}
              onClick={(event) => {
                event.preventDefault();
                void onDelete();
              }}
            >
              {busyId ? "Siliniyor…" : "Fırsat Kartını Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}
