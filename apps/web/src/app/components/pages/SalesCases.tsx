import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Search, Download, ArrowUpDown, Building2, MoreHorizontal } from "lucide-react";
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
  const { cases: salesCases, customers, users } = useStore();
  const [view, setView] = useState<"list" | "kanban">(initialView);
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
    <Tabs value={view} onValueChange={(v) => setView(v as "list" | "kanban")} className="space-y-4">
      <TabsList>
        <TabsTrigger value="list">Liste</TabsTrigger>
        <TabsTrigger value="kanban">Kanban</TabsTrigger>
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
            <span className="inline-flex h-8 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs text-emerald-700">
              Kazanılanlar
            </span>
          )}
          {focusLost && (
            <span className="inline-flex h-8 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs text-red-700">
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
                <TableHead>Ürün / Model</TableHead>
                <TableHead className="text-right">Adet</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Aşama</TableHead>
                <TableHead>Atanan</TableHead>
                <TableHead>Açılış</TableHead>
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
                    <TableCell>
                      <div className="text-sm">{s.requestedProduct}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{s.requestedModel}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="text-sm">{s.estimatedAmount.toLocaleString()}</span>{" "}
                      <span className="text-[11px] text-muted-foreground">{s.currency}</span>
                    </TableCell>
                    <TableCell><StatusBadge status={s.stage} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarFallback className="bg-primary/15 text-primary text-[10px]">{initials(u?.name ?? "—")}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{(u?.name ?? "Atanmadı").split(" ")[0]}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{s.createdAt}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100" title="Detay" onClick={(e) => { e.stopPropagation(); onSelect(s); }}>
                        <MoreHorizontal className="size-4" />
                      </Button>
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
    </Tabs>
  );
}
