import { useState, type MouseEvent } from "react";
import {
  AlarmClock,
  ArrowRight,
  Building2,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  LockKeyhole,
  MapPin,
  Phone,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
import {
  OPPORTUNITY_PAYMENT_METHOD_LABELS,
  QUALIFICATION_STAGE_LABELS,
  QUALIFICATION_STAGES,
  salesStageLabel,
  type OpportunityApprovalType,
  type OpportunityPaymentMethod,
  type QualificationStage,
  type SalesCase,
} from "../../lib/mock";
import { KanbanBoard, type KanbanColumn } from "../KanbanBoard";
import { LogActivityDialog } from "../dialogs/CreateDialogs";
import { LostCaseDialog } from "../dialogs/LostCaseDialog";
import { NextActionDialog, actionDateLabel, isActionOverdue } from "../shared/NextActionDialog";
import { RequestedMachineCombobox } from "../shared/RequestedMachineCombobox";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
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

const APPROVALS: Array<{ type: OpportunityApprovalType; label: string }> = [
  { type: "payment", label: "Ödeme" },
  { type: "customs", label: "Gümrük" },
  { type: "invoice", label: "Fatura" },
  { type: "installation", label: "Kurulum" },
  { type: "win", label: "WIN onayı" },
];

const STAGE_ACTION_HINTS: Record<ActiveQualificationStage, string> = {
  c: "Firma, konum ve karar verici bilgisini tamamlayın.",
  b: "İhtiyacı ve istenen makineyi müşteriyle netleştirin.",
  a: "Teklif, sözleşme ve ödeme şartlarında sıradaki işi belirleyin.",
  a_plus: "Bekleyen operasyon onayını sonuçlandırın.",
  win: "Teslimat ve kurulum devrindeki sıradaki işi belirleyin.",
  lost: "Kaybın ardından yapılacak kapanış veya yeniden temas işini belirleyin.",
};

const initials = (value: string) =>
  (value || "—")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export function QualificationKanban({
  items,
  onSelect,
  onRequestDelete,
}: {
  items: SalesCase[];
  onSelect: (salesCase: SalesCase) => void;
  onRequestDelete?: (salesCase: SalesCase) => void;
}) {
  const {
    customers,
    users,
    products,
    moveQualification,
    decideCaseApproval,
    updateCase,
    closeCase,
  } = useStore();
  const { hasPermission } = useAuth();
  const canApprove = hasPermission("opportunities.approve");
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
      toast.success("Fırsat önceki dereceye alındı", {
        description: QUALIFICATION_STAGE_LABELS[pendingBackMove.to],
      });
      setPendingBackMove(null);
      setBackReason("");
    } catch (error: any) {
      toast.error("Geri alınamadı", { description: error?.message ?? "İşlem başarısız oldu." });
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (salesCase: SalesCase, type: OpportunityApprovalType) => {
    if (busyId) return;
    setBusyId(salesCase.id);
    try {
      await decideCaseApproval(salesCase.id, type, "approved");
      toast.success("Onay kaydedildi", { description: APPROVALS.find((item) => item.type === type)?.label });
    } catch (error: any) {
      toast.error("Onay verilemedi", {
        description: error?.message ?? "Bağlı operasyon kaydını kontrol edin.",
      });
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fırsatı geri al</DialogTitle>
            <DialogDescription>
              {pendingBackMove
                ? `${QUALIFICATION_STAGE_LABELS[pendingBackMove.salesCase.qualificationStage]} → ${QUALIFICATION_STAGE_LABELS[pendingBackMove.to]} geçişi`
                : ""}
              . Sonraki aşamaya ait onaylar sıfırlanır.
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
              Geri al
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
          const owner = users.find((item) => item.id === salesCase.assignedUserId);
          const stage = (salesCase.qualificationStage ?? "c") as Exclude<QualificationStage, "lead">;
          const meta = STAGE_META[stage];
          const readiness = salesCase.qualificationReadiness;
          const checks = readiness?.checks ?? [];
          const actionOverdue = isActionOverdue(salesCase.nextActionAt);
          const stopCardClick = (event: MouseEvent) => event.stopPropagation();
          const partyName =
            company?.name ||
            salesCase.leadCompanyTitle ||
            salesCase.leadContactName ||
            "Firma bilgisi bekleniyor";
          const contactLine =
            [salesCase.leadPhone || company?.phone, salesCase.leadEmail || company?.email]
              .filter(Boolean)
              .join(" · ") || "İletişim bilgisi bekleniyor";
          return (
            <Card
              data-testid={`sales-kanban-card-${salesCase.id}`}
              onClick={() => onSelect(salesCase)}
              className="group gap-0 overflow-hidden rounded-xl border border-border/70 bg-white p-0 shadow-xs transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-md"
            >
              <div className="h-1.5" style={{ backgroundColor: meta.color }} />
              <div className="space-y-3 p-3">
                <div className="flex items-start gap-2.5">
                  <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${meta.surface}`}>
                    {company ? <Building2 className="size-4" /> : <UserRound className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold leading-tight group-hover:text-primary">
                      {partyName}
                    </div>
                    <div className="mt-1 truncate text-[10px] text-muted-foreground">
                      {salesCase.leadContactName || company?.contactPerson || "Kontak bekleniyor"}
                    </div>
                  </div>
                  {stage !== "win" && stage !== "lost" && <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        title="Dereceye gönder"
                        onClick={stopCardClick}
                        onMouseDown={stopCardClick}
                      >
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52" onClick={stopCardClick}>
                      <DropdownMenuLabel>Dereceye gönder</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {ACTIVE_QUALIFICATION_STAGES.map((target) => {
                        const currentIndex = ACTIVE_QUALIFICATION_STAGES.indexOf(stage);
                        const targetIndex = ACTIVE_QUALIFICATION_STAGES.indexOf(target);
                        const adjacent = Math.abs(targetIndex - currentIndex) === 1;
                        const allowed = target === "lost" || adjacent;
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
                    </DropdownMenuContent>
                  </DropdownMenu>}
                  {onRequestDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-destructive opacity-100 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                      title="Fırsat kartını sil"
                      aria-label={`${partyName} fırsat kartını sil`}
                      disabled={busyId === salesCase.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRequestDelete(salesCase);
                      }}
                      onMouseDown={stopCardClick}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>

                <div className="space-y-1.5 rounded-lg border border-border/60 bg-slate-50/75 p-2.5 text-[10px]">
                  <div className="flex items-center gap-1.5 text-foreground/80">
                    <MapPin className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {[company?.district, company?.city].filter(Boolean).join(" / ") || salesCase.leadCity || "Konum bekleniyor"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-foreground/80">
                    <Phone className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{contactLine}</span>
                  </div>
                  {stage === "c" && (
                    <>
                      <div className="truncate text-muted-foreground">{company?.address || "Açık adres bekleniyor"}</div>
                      <div className="truncate text-muted-foreground">Sektör: {company?.sector || "bekleniyor"}</div>
                    </>
                  )}
                </div>

                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Konu / Makine</div>
                  <div className="mt-1 line-clamp-2 text-[11px] font-medium">
                    {salesCase.requestedMachine || salesCase.requestedModel || salesCase.requestedProduct}
                  </div>
                </div>

                {stage === "lost" && (
                  <div className="space-y-1.5 rounded-lg border border-red-200 bg-red-50/70 p-2.5 text-[10px]">
                    <div className="font-semibold text-red-800">
                      {salesCase.lostReason || salesCase.lostReasonCode || "Kayıp nedeni belirtilmedi"}
                    </div>
                    <div className="text-slate-700">
                      Ürün: {salesCase.lostProductName || salesCase.requestedMachine || salesCase.requestedModel || salesCase.requestedProduct}
                    </div>
                    <div className="text-slate-600">
                      Rakip: {[salesCase.competitor, salesCase.lostCompetitorProductModel].filter(Boolean).join(" · ") || "yok / bilinmiyor"}
                    </div>
                    <div className="line-clamp-2 text-slate-600">
                      Uymayan şartlar: {salesCase.lostUnmetConditions || salesCase.qualificationNote || "belirtilmedi"}
                    </div>
                  </div>
                )}

                <div
                  className={`rounded-r-lg border-l-[3px] px-2.5 py-2 ${actionOverdue ? "border-red-500 bg-red-50/75" : "border-primary bg-blue-50/70"}`}
                  onClick={stopCardClick}
                  onMouseDown={stopCardClick}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-data text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <AlarmClock className="size-3 text-primary" /> Sonraki aksiyon
                    </span>
                    <span className={`inline-flex shrink-0 items-center gap-1 text-[8px] ${actionOverdue ? "font-semibold text-red-700" : "text-muted-foreground"}`}>
                      <CalendarClock className="size-3" />
                      {actionOverdue ? "Gecikti · " : ""}{actionDateLabel(salesCase.nextActionAt)}
                    </span>
                  </div>
                  <div className={`mt-1 line-clamp-2 text-[10px] leading-4 ${salesCase.nextAction ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {salesCase.nextAction || STAGE_ACTION_HINTS[stage]}
                  </div>
                  {canUpdate && (
                    <NextActionDialog
                      salesCase={salesCase}
                      onSave={(patch) => updateCase(salesCase.id, patch)}
                      trigger={
                        <Button type="button" variant="ghost" size="sm" className="mt-1 h-6 gap-1 px-1.5 text-[8px] text-primary">
                          <AlarmClock className="size-3" />
                          {salesCase.nextAction ? "Düzenle" : "Aksiyon planla"}
                        </Button>
                      }
                    />
                  )}
                </div>

                {stage === "b" && (
                  <div className="space-y-2" onClick={stopCardClick} onMouseDown={stopCardClick}>
                    {company && (
                      <div className="grid grid-cols-2 gap-2">
                        <LogActivityDialog
                          customerId={company.id}
                          opportunityId={salesCase.id}
                          defaultKind="call"
                          trigger={
                            <Button variant="outline" size="sm" className="h-8 gap-1 text-[10px]">
                              <Phone className="size-3.5" /> Arama yap
                            </Button>
                          }
                        />
                        <LogActivityDialog
                          customerId={company.id}
                          opportunityId={salesCase.id}
                          defaultKind="visit"
                          trigger={
                            <Button variant="outline" size="sm" className="h-8 gap-1 text-[10px]">
                              <MapPin className="size-3.5" /> Ziyaret et
                            </Button>
                          }
                        />
                      </div>
                    )}
                    <RequestedMachineCombobox
                      className="h-8 bg-white text-[11px]"
                      products={products}
                      value={salesCase.requestedMachine}
                      disabled={!canUpdate || busyId === salesCase.id}
                      onValueChange={async (value) => {
                        if (value === (salesCase.requestedMachine ?? "")) return;
                        setBusyId(salesCase.id);
                        try {
                          await updateCase(salesCase.id, { requestedMachine: value });
                          toast.success("İstenen makine kaydedildi");
                        } catch (error: any) {
                          toast.error("Makine kaydedilemedi", {
                            description: error?.message ?? "İstek başarısız oldu.",
                          });
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    />
                    <Select
                      value={salesCase.paymentMethod ?? "undecided"}
                      onValueChange={(value) =>
                        void updateCase(salesCase.id, { paymentMethod: value as OpportunityPaymentMethod })
                      }
                    >
                      <SelectTrigger className="h-8 bg-white text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(OPPORTUNITY_PAYMENT_METHOD_LABELS) as Array<[OpportunityPaymentMethod, string]>).map(
                          ([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {stage === "a" && (
                  <div className="space-y-2" onClick={stopCardClick} onMouseDown={stopCardClick}>
                    <Textarea
                      className="min-h-16 bg-white text-[11px]"
                      defaultValue={salesCase.contractTerms ?? ""}
                      placeholder="Sözleşme şartları"
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value !== (salesCase.contractTerms ?? "")) {
                          void updateCase(salesCase.id, { contractTerms: value || null });
                        }
                      }}
                    />
                    <Textarea
                      className="min-h-16 bg-white text-[11px]"
                      defaultValue={salesCase.paymentTerms ?? ""}
                      placeholder="Ödeme koşulları"
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value !== (salesCase.paymentTerms ?? "")) {
                          void updateCase(salesCase.id, { paymentTerms: value || null });
                        }
                      }}
                    />
                  </div>
                )}

                {stage === "a_plus" && (
                  <div className="space-y-1.5" onClick={stopCardClick} onMouseDown={stopCardClick}>
                    {APPROVALS.map(({ type, label }) => {
                      const status = readiness?.approvals?.[type] ?? "pending";
                      const approved = status === "approved";
                      return (
                        <div key={type} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-white px-2 py-1.5">
                          <span className="flex min-w-0 items-center gap-1.5 text-[10px]">
                            {approved
                              ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                              : <LockKeyhole className="size-3.5 shrink-0 text-amber-600" />}
                            <span className="truncate">{label}</span>
                          </span>
                          {canApprove && !approved && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-1.5 text-[9px] text-primary"
                              disabled={busyId === salesCase.id}
                              onClick={() => void approve(salesCase, type)}
                            >
                              <ShieldCheck className="size-3" /> Onayla
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {checks.length > 0 && (
                  <div
                    className="rounded-lg border border-border/60 bg-white p-2"
                    title={readiness?.blockers?.join(" · ")}
                  >
                    <div className="mb-1.5 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      <span>Hazırlık</span>
                      <span>{checks.filter((check) => check.complete).length}/{checks.length}</span>
                    </div>
                    <div className="flex gap-1">
                      {checks.map((check) => (
                        <span
                          key={check.key}
                          className={`h-1.5 min-w-2 flex-1 rounded-full ${check.complete ? meta.dot : "bg-slate-200"}`}
                          title={`${check.label}: ${check.complete ? "tamam" : "eksik"}`}
                        />
                      ))}
                    </div>
                    {!readiness?.ready && readiness?.blockers?.[0] && (
                      <div className="mt-1.5 flex items-center gap-1 text-[9px] text-amber-700">
                        <CircleAlert className="size-3 shrink-0" />
                        <span className="truncate">{readiness.blockers[0]}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-display text-lg font-semibold leading-none text-primary">
                      {salesCase.estimatedAmount.toLocaleString("tr-TR")}{" "}
                      <span className="font-data text-[9px] font-medium text-muted-foreground">{salesCase.currency}</span>
                    </div>
                    <Badge variant="outline" className="mt-1 h-5 max-w-[140px] text-[8px]">
                      Operasyon: {salesStageLabel(salesCase.stage)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(stage === "win" || stage === "lost") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 gap-1 px-2 text-[9px] ${stage === "win" ? "text-emerald-700" : "text-red-700"}`}
                        disabled={busyId === salesCase.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void archive(salesCase);
                        }}
                      >
                        <Check className="size-3" /> Tamamla
                      </Button>
                    )}
                    <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Calendar className="size-3" /> {salesCase.createdAt.slice(5)}
                    </span>
                    <Avatar className="size-5">
                      <AvatarFallback className="bg-primary/10 text-[8px] text-primary">
                        {initials(owner?.name ?? "—")}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>
              </div>
            </Card>
          );
        }}
      />
    </>
  );
}
