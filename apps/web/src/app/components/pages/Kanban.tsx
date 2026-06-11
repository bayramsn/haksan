import { useState } from "react";
import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { SALES_STAGES, SalesCase, SalesStage, salesStageLabel } from "../../lib/mock";
import { ArrowRight, Building2, Calendar } from "lucide-react";
import { KanbanBoard, KanbanColumn } from "../KanbanBoard";
import { useStore } from "../../lib/store";
import { LostCaseDialog } from "../dialogs/LostCaseDialog";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const STAGE_DOT: Record<string, string> = {
  lead: "bg-zinc-400",
  sales: "bg-zinc-400",
  call: "bg-blue-400",
  visit: "bg-blue-500",
  cancelled: "bg-red-500",
  quote: "bg-indigo-500",
  proforma: "bg-emerald-500",
  contract: "bg-emerald-500",
  commercial_invoice: "bg-amber-500",
  customs_approved: "bg-amber-500",
  stock_picking: "bg-sky-500",
  shipping: "bg-blue-500",
  installation: "bg-brand-blue",
  delivered: "bg-emerald-600",
  Lead: "bg-zinc-400",
  "Initial Contact": "bg-zinc-400",
  "Requirement Analysis": "bg-blue-400",
  "Offer Preparing": "bg-blue-500",
  "Offer Sent": "bg-indigo-500",
  "Follow-up": "bg-indigo-400",
  "Offer Approved": "bg-emerald-500",
  "Proforma / Contract": "bg-emerald-500",
  Customs: "bg-amber-500",
  Shipment: "bg-amber-500",
  Installation: "bg-amber-500",
  Completed: "bg-emerald-600",
  Lost: "bg-red-500",
};

const initials = (n: string) => (n || "—").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function KanbanPage({ onSelect }: { onSelect: (s: SalesCase) => void }) {
  const { cases, moveCase, customers, users } = useStore();
  const [lostId, setLostId] = useState<string | null>(null);
  const lostCustomer = lostId ? customers.find((x) => x.id === cases.find((s) => s.id === lostId)?.customerId)?.name : undefined;

  const moveToStage = async (id: string, from: SalesStage, to: SalesStage) => {
    if (from === to) return;
    if (to === "cancelled") {
      setLostId(id);
      return;
    }
    try {
      await moveCase(id, to);
      toast.success("Kart taşındı", { description: `Yeni aşama: ${salesStageLabel(to)}` });
    } catch (err: any) {
      toast.error("Kart taşınamadı", { description: err?.message ?? "Aşama gereksinimleri tamamlanmalı." });
    }
  };

  const columns: KanbanColumn<SalesCase>[] = SALES_STAGES.map((stage) => {
    const items = cases.filter((s) => s.stage === stage);
    const total = items.reduce((a, s) => a + s.estimatedAmount, 0);
    return {
      key: stage,
      title: salesStageLabel(stage),
      dot: STAGE_DOT[stage],
      items,
      footer: (
        <div className="flex items-center justify-between">
          <span>Toplam</span>
          <span>€ {total.toLocaleString()}</span>
        </div>
      ),
    };
  });

  return (
    <>
    <LostCaseDialog open={!!lostId} onOpenChange={(o) => !o && setLostId(null)} caseId={lostId} caseName={lostCustomer} />
    <KanbanBoard<SalesCase>
      columns={columns}
      fit={false}
      columnWidth={292}
      onMove={(id, from, to) => moveToStage(id, from as SalesStage, to as SalesStage)}
      renderCard={(s) => {
        const c = customers.find((x) => x.id === s.customerId);
        const u = users.find((x) => x.id === s.assignedUserId);
        return (
          <Card
            onClick={() => onSelect(s)}
            className="overflow-hidden p-3 hover:shadow-md hover:border-primary/40 transition-all border-border/60 group bg-white"
          >
            <div className="flex items-start gap-2">
              <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-[10px] shrink-0">
                {c?.type !== "person" ? <Building2 className="size-3.5" /> : initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-tight truncate group-hover:text-primary transition-colors">{c?.name ?? "Firma bulunamadı"}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-2 break-words mt-0.5">{s.requestedProduct}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 opacity-80 hover:opacity-100"
                    title="Aşamaya gönder"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <ArrowRight className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuLabel>Aşamaya gönder</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SALES_STAGES.map((stage) => (
                    <DropdownMenuItem
                      key={stage}
                      disabled={stage === s.stage}
                      onSelect={() => void moveToStage(s.id, s.stage, stage)}
                    >
                      <span className={`size-2 rounded-full shrink-0 ${STAGE_DOT[stage]}`} />
                      <span className="truncate">{salesStageLabel(stage)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              <span className="inline-flex max-w-full truncate px-1.5 py-0.5 rounded text-[10px] bg-muted text-foreground/70">{s.requestedModel || "Model yok"}</span>
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-muted text-foreground/70">×{s.quantity}</span>
              {s.isOfferPrepared && (
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700">Teklif</span>
              )}
            </div>

            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/60">
              <div className="min-w-0 truncate text-[13px] tabular-nums tracking-tight">
                {s.estimatedAmount.toLocaleString()} <span className="text-[11px] text-muted-foreground">{s.currency}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="size-2.5" />
                  {s.createdAt.slice(5)}
                </span>
                <Avatar className="size-5">
                  <AvatarFallback className="bg-primary/15 text-primary text-[9px]">
                    {initials(u?.name ?? "—")}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </Card>
        );
      }}
    />
    </>
  );
}
