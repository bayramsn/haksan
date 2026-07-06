import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Search, ArrowUpDown, Building2, MoreHorizontal, CheckCircle2, RotateCcw } from "lucide-react";
import { SalesCase, salesStageLabel } from "../../lib/mock";
import { StatusBadge } from "../Layout";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../lib/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { KanbanPage } from "./Kanban";
import { FilterPopover, usePaged, Pager } from "../ui/list-controls";
import { ExportExcelButton } from "../ui/ExportExcelButton";
import { type OperationFocus } from "../../lib/operations";

const initials = (n: string) => (n || "—").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function SalesCasesPage({
  onSelect,
  initialView = "list",
  focus,
}: {
  onSelect: (s: SalesCase) => void;
  initialView?: "list" | "kanban";
  focus?: OperationFocus;
}) {
  const { cases: salesCases, closedCases, customers, users, closeCase, reopenCase } = useStore();
  const [view, setView] = useState<"list" | "kanban" | "archive">(initialView);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onClose = async (id: string) => {
    if (busyId) return;
    if (!window.confirm("Bu kart 'Tamamlandı' olarak arşivlenecek (silinmez, Geçmiş'te kalır). Devam edilsin mi?")) return;
    setBusyId(id);
    try {
      await closeCase(id);
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
    const c = customers.find((x) => x.id === s.customerId);
    return (c?.name ?? "").toLowerCase().includes(q.toLowerCase()) || s.requestedProduct.toLowerCase().includes(q.toLowerCase());
  });

  const sorted = useMemo(() => {
    if (!nameSort) return filtered;
    return [...filtered].sort((a, b) => {
      const an = (customers.find((x) => x.id === a.customerId)?.name ?? "").localeCompare(
        customers.find((x) => x.id === b.customerId)?.name ?? "",
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
              placeholder="Müşteri / ürün ara..."
              className="pl-9 h-9 bg-white"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <FilterPopover
            filters={[
              { label: "Aşama", value: stage, onChange: setStage, options: stageOptions },
              { label: "Para Birimi", value: currency, onChange: setCurrency, options: currencyOptions },
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
        <ExportExcelButton path="/exports/opportunities" filename="satis-kartlari.xlsx" params={exportParams} className="h-9" />
      </div>

      <TabsContent value="kanban" className="mt-0">
        <KanbanPage onSelect={onSelect} items={sorted} />
      </TabsContent>
      <TabsContent value="list" className="mt-0 space-y-4">

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[280px]">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => setNameSort((s) => (s === "asc" ? "desc" : "asc"))}
                    aria-label="Müşteriye göre sırala"
                  >
                    Müşteri <ArrowUpDown className="size-3" />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">Ürün / Model</TableHead>
                <TableHead className="hidden md:table-cell text-right">Adet</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Aşama</TableHead>
                <TableHead className="hidden sm:table-cell">Atanan</TableHead>
                <TableHead className="hidden md:table-cell">Açılış</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((s) => {
                const c = customers.find((x) => x.id === s.customerId);
                const u = users.find((x) => x.id === s.assignedUserId);
                return (
                  <TableRow key={s.id} className="cursor-pointer group" onClick={() => onSelect(s)}>
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                          <Building2 className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{c?.name ?? "Firma bulunamadı"}</div>
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">#{s.id.toUpperCase()} · {c?.city ?? "—"}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-sm">{s.requestedProduct}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{s.requestedModel}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums">{s.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="text-sm">{s.estimatedAmount.toLocaleString()}</span>{" "}
                      <span className="text-[11px] text-muted-foreground">{s.currency}</span>
                    </TableCell>
                    <TableCell><StatusBadge status={s.stage} /></TableCell>
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
                            onClick={() => onClose(s.id)}
                          >
                            <CheckCircle2 className="size-3.5" /> Bitir
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100" title="Detay" onClick={() => onSelect(s)}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
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
                              <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{c?.name ?? "Firma bulunamadı"}</div>
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
    </Tabs>
  );
}
