import { useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  Building2,
  Check,
  MoreHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../lib/store";
import {
  QUALIFICATION_STAGE_LABELS,
  QUALIFICATION_STAGES,
  type QualificationStage,
  type SalesCase,
} from "../../lib/mock";
import { KanbanBoard, type KanbanColumn } from "../KanbanBoard";
import { LostCaseDialog } from "../dialogs/LostCaseDialog";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

type ActiveQualificationStage = Exclude<QualificationStage, "lead">;
const ACTIVE_QUALIFICATION_STAGES = QUALIFICATION_STAGES as ActiveQualificationStage[];

const STAGE_META: Record<
  ActiveQualificationStage,
  { color: string; dot: string; surface: string; description: string }
> = {
  c: {
    color: "#64748B",
    dot: "bg-slate-500",
    surface: "bg-slate-50 text-slate-700",
    description: "Firma verisi",
  },
  b: {
    color: "#2563EB",
    dot: "bg-blue-600",
    surface: "bg-blue-50 text-blue-700",
    description: "Temas ve ihtiyaç",
  },
  a: {
    color: "#4F46E5",
    dot: "bg-indigo-600",
    surface: "bg-indigo-50 text-indigo-700",
    description: "Ticari şartlar",
  },
  a_plus: {
    color: "#D97706",
    dot: "bg-amber-600",
    surface: "bg-amber-50 text-amber-700",
    description: "Operasyon onayları",
  },
  win: {
    color: "#059669",
    dot: "bg-emerald-600",
    surface: "bg-emerald-50 text-emerald-700",
    description: "Kazanıldı",
  },
  lost: {
    color: "#DC2626",
    dot: "bg-red-600",
    surface: "bg-red-50 text-red-700",
    description: "Kaybedildi",
  },
};

export function QualificationKanban({
  items,
  onSelect,
  onRequestDelete,
}: {
  items: SalesCase[];
  onSelect: (salesCase: SalesCase) => void;
  onRequestDelete?: (salesCase: SalesCase) => void;
}) {
  const { customers, moveQualification, closeCase } = useStore();
  const [lostId, setLostId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingBackMove, setPendingBackMove] = useState<{
    salesCase: SalesCase;
    to: QualificationStage;
  } | null>(null);
  const [backReason, setBackReason] = useState("");

  const lostCase = lostId ? items.find((item) => item.id === lostId) : null;
  const lostCompany = lostCase ? customers.find((company) => company.id === lostCase.customerId) : null;

  const columns: KanbanColumn<SalesCase>[] = ACTIVE_QUALIFICATION_STAGES.map((stage) => {
    const stageItems = items.filter((item) => (item.qualificationStage ?? "c") === stage);
    const total = stageItems.reduce((sum, item) => sum + item.estimatedAmount, 0);
    return {
      key: stage,
      title: QUALIFICATION_STAGE_LABELS[stage],
      dot: STAGE_META[stage].dot,
      items: stageItems,
      footer: (
        <div className="flex items-center justify-between">
          <span>{STAGE_META[stage].description}</span>
          <span>{total.toLocaleString("tr-TR")} €</span>
        </div>
      ),
    };
  });

  const move = async (id: string, fromValue: string, toValue: string) => {
    const salesCase = items.find((item) => item.id === id);
    if (!salesCase) return;
    const from = fromValue as QualificationStage;
    const to = toValue as QualificationStage;
    if (from === "lost") {
      setPendingBackMove({ salesCase, to });
      setBackReason("");
      return;
    }
    if (to === "lost") {
      setLostId(id);
      return;
    }
    const fromIndex = QUALIFICATION_STAGES.indexOf(from);
    const toIndex = QUALIFICATION_STAGES.indexOf(to);
    if (toIndex < fromIndex) {
      setPendingBackMove({ salesCase, to });
      setBackReason("");
      return;
    }
    setBusyId(id);
    try {
      await moveQualification(id, to);
      toast.success("Fırsat taşındı", { description: `Yeni derece: ${QUALIFICATION_STAGE_LABELS[to]}` });
    } catch (error: any) {
      const blockers = error?.details?.blockers ?? error?.response?.data?.error?.details?.blockers;
      toast.error("Fırsat taşınamadı", {
        description: Array.isArray(blockers) && blockers.length
          ? blockers.join(" · ")
          : error?.message ?? "Aşama koşullarını tamamlayın.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const confirmBackMove = async () => {
    if (!pendingBackMove || !backReason.trim()) return;
    setBusyId(pendingBackMove.salesCase.id);
    try {
      await moveQualification(pendingBackMove.salesCase.id, pendingBackMove.to, { note: backReason });
      const fromLost = pendingBackMove.salesCase.qualificationStage === "lost";
      toast.success(fromLost ? "LOST kaydı hedef dereceye taşındı" : "Fırsat önceki dereceye alındı", {
        description: fromLost
          ? `${QUALIFICATION_STAGE_LABELS[pendingBackMove.to]} · Firma, makine ve kayıp bilgileri korundu`
          : QUALIFICATION_STAGE_LABELS[pendingBackMove.to],
      });
      setPendingBackMove(null);
      setBackReason("");
    } catch (error: any) {
      toast.error("Geri alınamadı", { description: error?.message ?? "İşlem başarısız oldu." });
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (salesCase: SalesCase) => {
    if (busyId) return;
    setBusyId(salesCase.id);
    try {
      await closeCase(salesCase.id);
      toast.success("Fırsat Geçmiş'e alındı");
    } catch (error: any) {
      toast.error("Fırsat arşivlenemedi", { description: error?.message ?? "İşlem başarısız oldu." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <LostCaseDialog
        open={Boolean(lostId)}
        onOpenChange={(open) => !open && setLostId(null)}
        caseId={lostId}
        caseName={lostCompany?.name ?? lostCase?.leadCompanyTitle ?? lostCase?.leadContactName}
        productName={lostCase?.requestedMachine || [lostCase?.requestedProduct, lostCase?.requestedModel].filter(Boolean).join(" · ")}
      />
      <Dialog open={Boolean(pendingBackMove)} onOpenChange={(open) => !open && setPendingBackMove(null)}>
        <DialogContent className={`sm:max-w-md ${pendingBackMove?.salesCase.qualificationStage === "lost" ? "overflow-hidden border-l-4 border-red-600" : ""}`}>
          <DialogHeader>
            <DialogTitle>{pendingBackMove?.salesCase.qualificationStage === "lost" ? "LOST kaydını hedef dereceye taşı" : "Fırsatı geri al"}</DialogTitle>
            <DialogDescription>
              {pendingBackMove
                ? `${QUALIFICATION_STAGE_LABELS[pendingBackMove.salesCase.qualificationStage]} → ${QUALIFICATION_STAGE_LABELS[pendingBackMove.to]} geçişi`
                : ""}
              {pendingBackMove?.salesCase.qualificationStage === "lost"
                ? ". Kart doğrudan seçtiğiniz dereceye taşınır; firma, makine, aktiviteler ve kayıp bilgileri korunur."
                : ". Sonraki aşamaya ait onaylar sıfırlanır."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="qualification-back-reason">Gerekçe *</Label>
            <Textarea
              id="qualification-back-reason"
              className="mt-1.5"
              value={backReason}
              onChange={(event) => setBackReason(event.target.value)}
              maxLength={1000}
              placeholder="Kart neden önceki aşamaya alınıyor?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingBackMove(null)}>Vazgeç</Button>
            <Button disabled={!backReason.trim() || Boolean(busyId)} onClick={() => void confirmBackMove()}>
              {pendingBackMove?.salesCase.qualificationStage === "lost"
                ? `${pendingBackMove ? QUALIFICATION_STAGE_LABELS[pendingBackMove.to] : "Hedef"} derecesine taşı`
                : "Geri al"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KanbanBoard<SalesCase>
        columns={columns}
        storageKey="sales-qualification"
        columnWidth={typeof window !== "undefined" && window.innerWidth < 640 ? 260 : 304}
        onMove={move}
        renderCard={(salesCase) => {
          const company = customers.find((item) => item.id === salesCase.customerId);
          const stage = (salesCase.qualificationStage ?? "c") as Exclude<QualificationStage, "lead">;
          const meta = STAGE_META[stage];
          const stopCardClick = (event: MouseEvent) => event.stopPropagation();
          const partyName =
            company?.name ||
            salesCase.leadCompanyTitle ||
            "Firma bilgisi bekleniyor";
          const openDetailsFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            onSelect(salesCase);
          };
          return (
            <Card
              data-testid={`sales-kanban-card-${salesCase.id}`}
              role="button"
              tabIndex={0}
              aria-label={`${partyName} fırsat detayını aç`}
              onClick={() => onSelect(salesCase)}
              onKeyDown={openDetailsFromKeyboard}
              className="group cursor-pointer gap-0 overflow-hidden rounded-xl border border-[#0b2453]/15 bg-white p-0 shadow-xs outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-[#2457D6]/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#2457D6] focus-visible:ring-offset-2"
            >
              <div className="h-1.5" style={{ backgroundColor: meta.color }} />
              <div className="flex min-h-24 items-start gap-3 p-3.5">
                <div className={`grid size-10 shrink-0 place-items-center rounded-lg ${meta.surface}`} aria-hidden="true">
                  {company ? <Building2 className="size-[18px]" /> : <UserRound className="size-[18px]" />}
                </div>
                <div className="min-w-0 flex-1 border-l-2 border-[#0b2453]/10 pl-3">
                  <div className="font-data text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0b2453]/55">
                    Firma
                  </div>
                  <div className="mt-1 whitespace-normal break-words [overflow-wrap:anywhere] font-display text-[17px] font-semibold leading-[1.18] text-[#0b1739] transition-colors group-hover:text-[#2457D6]">
                    {partyName}
                  </div>
                  {company?.companyNo && (
                    <div className="mt-2 font-data text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Firma no · {company.companyNo}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        title="Kart işlemleri"
                        aria-label={`${partyName} kart işlemleri`}
                        onClick={stopCardClick}
                        onMouseDown={stopCardClick}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52" onClick={stopCardClick}>
                      <DropdownMenuLabel>Kart işlemleri</DropdownMenuLabel>
                      {stage !== "win" && (
                        <>
                          <DropdownMenuSeparator />
                          {ACTIVE_QUALIFICATION_STAGES.map((target) => {
                            const currentIndex = ACTIVE_QUALIFICATION_STAGES.indexOf(stage);
                            const targetIndex = ACTIVE_QUALIFICATION_STAGES.indexOf(target);
                            const adjacent = Math.abs(targetIndex - currentIndex) === 1;
                            const allowed = stage === "lost" || target === "lost" || adjacent;
                            return (
                              <DropdownMenuItem
                                key={target}
                                disabled={target === stage || !allowed}
                                onSelect={() => void move(salesCase.id, stage, target)}
                              >
                                <span className={`size-2 rounded-full ${STAGE_META[target].dot}`} />
                                {QUALIFICATION_STAGE_LABELS[target]}
                              </DropdownMenuItem>
                            );
                          })}
                        </>
                      )}
                      {(stage === "win" || stage === "lost") && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={busyId === salesCase.id}
                            onSelect={() => void archive(salesCase)}
                          >
                            <Check className="size-3.5" /> Tamamla ve Geçmiş'e al
                          </DropdownMenuItem>
                        </>
                      )}
                      {onRequestDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            disabled={busyId === salesCase.id}
                            onSelect={() => onRequestDelete(salesCase)}
                          >
                            <Trash2 className="size-3.5" /> Fırsat kartını sil
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          );
        }}
      />
    </>
  );
}
