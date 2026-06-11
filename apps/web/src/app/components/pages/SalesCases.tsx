import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Search, Download, ArrowUpDown, Building2, MoreHorizontal } from "lucide-react";
import { SalesCase, salesStageLabel } from "../../lib/mock";
import { StatusBadge } from "../Layout";
import { useEffect, useState } from "react";
import { useStore } from "../../lib/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { KanbanPage } from "./Kanban";
import { FilterPopover, usePaged, Pager } from "../ui/list-controls";
import { exportToCsv } from "../../../lib/exportCsv";

const initials = (n: string) => (n || "—").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function SalesCasesPage({
  onSelect,
  initialView = "list",
}: {
  onSelect: (s: SalesCase) => void;
  initialView?: "list" | "kanban";
}) {
  const { cases: salesCases, customers, users } = useStore();
  const [view, setView] = useState<"list" | "kanban">(initialView);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");
  const [currency, setCurrency] = useState("all");

  const filtered = salesCases.filter((s) => {
    if (stage !== "all" && s.stage !== stage) return false;
    if (currency !== "all" && s.currency !== currency) return false;
    const c = customers.find((x) => x.id === s.customerId);
    return (c?.name ?? "").toLowerCase().includes(q.toLowerCase()) || s.requestedProduct.toLowerCase().includes(q.toLowerCase());
  });

  const { page, setPage, totalPages, pageItems } = usePaged(filtered, 12);

  const stageOptions = Array.from(new Set(salesCases.map((s) => s.stage))).map((v) => ({ value: v, label: salesStageLabel(v) }));
  const currencyOptions = Array.from(new Set(salesCases.map((s) => s.currency))).map((v) => ({ value: v, label: v }));

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const exportExcel = () =>
    exportToCsv(
      "satis-kartlari",
      ["No", "Müşteri", "Ürün", "Model", "Adet", "Tutar", "Para Birimi", "Aşama", "Atanan", "Açılış"],
      filtered.map((s) => {
        const c = customers.find((x) => x.id === s.customerId);
        const u = users.find((x) => x.id === s.assignedUserId);
        return [s.id.toUpperCase(), c?.name ?? "", s.requestedProduct, s.requestedModel, s.quantity, s.estimatedAmount, s.currency, salesStageLabel(s.stage), u?.name ?? "", s.createdAt];
      })
    );

  return (
    <Tabs value={view} onValueChange={(v) => setView(v as "list" | "kanban")} className="space-y-4">
      <TabsList>
        <TabsTrigger value="list">Liste</TabsTrigger>
        <TabsTrigger value="kanban">Kanban</TabsTrigger>
      </TabsList>
      <TabsContent value="kanban" className="mt-0">
        <KanbanPage onSelect={onSelect} />
      </TabsContent>
      <TabsContent value="list" className="mt-0 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative w-72">
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
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={exportExcel}><Download className="size-4" /> Excel</Button>
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[280px]">
                  <button className="inline-flex items-center gap-1 hover:text-foreground">
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
