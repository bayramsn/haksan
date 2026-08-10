import { useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  Building2,
  Check,
  MapPin,
  MoreHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
import {
  QUALIFICATION_STAGE_DESCRIPTIONS,
  QUALIFICATION_STAGE_LABELS,
  QUALIFICATION_STAGES,
  opportunityTransitionErrorMessage,
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
import { actionDateLabel, isActionOverdue } from "../shared/NextActionDialog";

type ActiveQualificationStage = Exclude<QualificationStage, "lead">;
const ACTIVE_QUALIFICATION_STAGES = QUALIFICATION_STAGES as ActiveQualificationStage[];

// Kolon açıklaması burada tutulmaz; Türkçe derece metinleri tek kaynaktan
// (mock.ts#QUALIFICATION_STAGE_DESCRIPTIONS) okunur.
const STAGE_META: Record<ActiveQualificationStage, { color: string; dot: string; surface: string }> = {
  c: {
    color: "#64748B",
    dot: "bg-slate-500",
    surface: "bg-slate-50 text-slate-700",
  },
  b: {
    color: "#2563EB",
    dot: "bg-blue-600",
    surface: "bg-blue-50 text-blue-700",
  },
  a: {
    color: "#4F46E5",
    dot: "bg-indigo-600",
    surface: "bg-indigo-50 text-indigo-700",
  },
  a_plus: {
    color: "#D97706",
    dot: "bg-amber-600",
    surface: "bg-amber-50 text-amber-700",
  },
  win: {
    color: "#059669",
    dot: "bg-emerald-600",
    surface: "bg-emerald-50 text-emerald-700",
  },
  lost: {
    color: "#DC2626",
    dot: "bg-red-600",
    surface: "bg-red-50 text-red-700",
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
  const { customers, contacts, moveQualification, closeCase } = useStore();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission("opportunities.update");
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
          <span>{QUALIFICATION_STAGE_DESCRIPTIONS[stage]}</span>
          <span>{total.toLocaleString("tr-TR")} €</span>
        </div>
      ),
    };
  });

  const move = async (id: string, fromValue: string, toValue: string) => {
    if (!canUpdate) {
      toast.error("Bu fırsatı ilerletme yetkiniz bulunmuyor");
      return;
    }
    if (busyId) return;
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
    } catch (error: unknown) {
      toast.error("Fırsat taşınamadı", {
        description: opportunityTransitionErrorMessage(error, "Aşama koşullarını tamamlayın."),
      });
    } finally {
      setBusyId(null);
    }
  };

  const confirmBackMove = async () => {
    if (!canUpdate || busyId || !pendingBackMove || !backReason.trim()) return;
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
    if (!canUpdate || busyId) return;
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
          const primaryContact =
            contacts.find((item) => item.id === salesCase.primaryContactId) ??
            contacts.find((item) =>
              (item.customerId === salesCase.customerId || item.companyIds?.includes(salesCase.customerId)) && item.isPrimary,
            ) ??
            contacts.find((item) => item.customerId === salesCase.customerId || item.companyIds?.includes(salesCase.customerId));
          const contactName = primaryContact?.name || salesCase.leadContactName || company?.contactPerson || "İlgili kişi belirlenmedi";
          const defaultAddress = company?.addresses?.find((item) => item.isDefault) ?? company?.addresses?.[0];
          const address = defaultAddress
            ? [defaultAddress.address, defaultAddress.district, defaultAddress.city].filter(Boolean).join(", ")
            : company
              ? [company.address, company.district, company.city].filter(Boolean).join(", ")
              : [salesCase.leadDistrict, salesCase.leadCity].filter(Boolean).join(", ");
          const stage = (salesCase.qualificationStage ?? "c") as Exclude<QualificationStage, "lead">;
          const meta = STAGE_META[stage];
          const stopCardClick = (event: MouseEvent) => event.stopPropagation();
          const partyName =
            company?.name ||
            salesCase.leadCompanyTitle ||
            "Firma bilgisi bekleniyor";
          const subject = salesCase.requestedProduct?.trim() || "Belirtilmedi";
          const machine = salesCase.requestedMachine?.trim() || salesCase.requestedModel?.trim() || "Belirtilmedi";
          const action = salesCase.nextAction?.trim() || "Planlanmadı";
          const actionOverdue = isActionOverdue(salesCase.nextActionAt);
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
              <div className="p-3">
                <div className="flex items-start gap-2.5">
                  <div className={`grid size-8 shrink-0 place-items-center rounded-md ${meta.surface}`} aria-hidden="true">
                    {company ? <Building2 className="size-4" /> : <UserRound className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 font-data text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0b2453]/55">
                      <span>Firma</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 whitespace-normal break-words [overflow-wrap:anywhere] font-display text-[15px] font-semibold leading-[1.25] text-[#0b1739]">
                      {partyName}
                    </div>
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
                                  disabled={!canUpdate || Boolean(busyId) || target === stage || !allowed}
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
                              disabled={!canUpdate || Boolean(busyId)}
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
                              disabled={!canUpdate || Boolean(busyId)}
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
                <div className="mt-3 border-t border-[#0b2453]/10 pt-2.5">
                  <div className="font-data text-[8px] font-semibold uppercase tracking-[0.13em] text-[#0b2453]/45">
                  Kart detayları
                  </div>
                  <dl className="mt-1 divide-y divide-slate-200/70">
                     <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 py-1.5">
                       <dt className="font-data text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Konu</dt>
                       <dd className="min-w-0 line-clamp-2 break-words text-[11px] font-medium leading-4 text-[#0b1739]">{subject}</dd>
                     </div>
                     <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 py-1.5">
                       <dt className="font-data text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">İlgili</dt>
                       <dd className="min-w-0 line-clamp-1 break-words text-[11px] font-medium leading-4 text-[#0b1739]">{contactName}</dd>
                     </div>
                     <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 py-1.5">
                       <dt className="flex items-center gap-1 font-data text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                         <MapPin className="size-3" aria-hidden="true" /> Adres
                       </dt>
                       <dd className="min-w-0 line-clamp-2 break-words text-[11px] leading-4 text-[#0b1739]">{address || "Adres bilgisi yok"}</dd>
                     </div>
                     <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 py-1.5">
                      <dt className="font-data text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Makina</dt>
                      <dd className="min-w-0 line-clamp-2 break-words text-[11px] font-medium leading-4 text-[#0b1739]">{machine}</dd>
                    </div>
                    <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 py-1.5">
                      <dt className={`font-data text-[9px] font-medium uppercase tracking-[0.08em] ${actionOverdue ? "text-red-700" : "text-muted-foreground"}`}>Aksiyon</dt>
                      <dd className="min-w-0">
                        <div className={`line-clamp-2 break-words text-[11px] font-medium leading-4 ${salesCase.nextAction ? "text-[#0b1739]" : "text-muted-foreground"}`}>{action}</div>
                        <div className={`mt-0.5 font-data text-[8px] ${actionOverdue ? "font-semibold text-red-700" : "text-muted-foreground"}`}>
                          {actionOverdue ? "Gecikti · " : ""}{actionDateLabel(salesCase.nextActionAt)}
                        </div>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </Card>
          );
        }}
      />
    </>
  );
}
