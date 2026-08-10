import { useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Mail,
  MapPin,
  Phone,
  Search,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../lib/auth";
import { opportunityService } from "../../../lib/services";
import { useStore } from "../../lib/store";
import type { OperationFocus } from "../../lib/operations";
import {
  LEAD_FOLLOW_UP_STATUS_LABELS,
  LEAD_FOLLOW_UP_STATUS_ORDER,
  LEAD_FOLLOW_UP_STATUS_STYLES,
  type LeadFollowUpStatus,
  type SalesCase,
} from "../../lib/mock";
import { LeadCaptureDialog } from "../dialogs/LeadCaptureDialog";
import { LeadDisqualifyDialog } from "../dialogs/LeadDisqualifyDialog";
import { TrelloCsvImportDialog } from "../dialogs/TrelloCsvImportDialog";
import { EmptyState } from "../shared/EmptyState";
import { NextActionDialog, actionDateLabel, isActionOverdue } from "../shared/NextActionDialog";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

const initials = (value: string) =>
  (value || "—")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

type LeadQueueView = "today" | "sla_risk" | "uncontacted" | "unassigned" | "no_action" | "mine" | "waiting" | "disqualified" | "all";

const QUEUE_VIEWS: Array<{ value: LeadQueueView; label: string }> = [
  { value: "today", label: "Bugün gelen" },
  { value: "sla_risk", label: "SLA riskli" },
  { value: "uncontacted", label: "Temas kurulmadı" },
  { value: "unassigned", label: "Sahipsiz" },
  { value: "no_action", label: "Aksiyonsuz" },
  { value: "mine", label: "Benim leadlerim" },
  { value: "waiting", label: "Beklemede" },
  { value: "disqualified", label: "Elenen" },
  { value: "all", label: "Tümü" },
];

const priorityLabel = (lead: SalesCase) =>
  lead.leadInsights?.priorityBand === "high"
    ? "Yüksek"
    : lead.leadInsights?.priorityBand === "medium"
      ? "Orta"
      : "Düşük";

const priorityStyle = (lead: SalesCase) =>
  lead.leadInsights?.priorityBand === "high"
    ? "border-red-200 bg-red-50 text-red-700"
    : lead.leadInsights?.priorityBand === "medium"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-600";

function leadName(lead: SalesCase) {
  return (
    lead.leadCompanyTitle ||
    lead.externalMetadata?.candidate?.companyTitle ||
    lead.leadContactName ||
    "Firma bilgisi bekleniyor"
  );
}

function missingLeadFields(lead: SalesCase) {
  return [
    !lead.leadContactName ? "Kontak" : null,
    !lead.leadPhone && !lead.leadEmail && !lead.leadContactValue ? "İletişim" : null,
    !lead.leadCity ? "Konum" : null,
    !lead.requestedProduct ? "Konu" : null,
  ].filter((value): value is string => Boolean(value));
}

export function LeadsPage({ onSelect, focus }: { onSelect: (lead: SalesCase) => void; focus?: OperationFocus }) {
  const { cases, users, convertCase, deleteCase, updateCase } = useStore();
  const { hasPermission, hasRole, user } = useAuth();
  const canConvert = hasPermission("opportunities.update");
  const canDelete = hasPermission("opportunities.delete");
  const canAssignOwner = hasRole("sales") || hasRole("super_admin");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadFollowUpStatus | "all">("all");
  const [queueView, setQueueView] = useState<LeadQueueView>("today");
  const [summary, setSummary] = useState<{
    medianFirstContactHours: number | null;
    slaBreaches: number;
    conversionRate: number;
    unassignedLeads: number;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SalesCase | null>(null);
  useEffect(() => {
    if (
      focus === "today" ||
      focus === "sla_risk" ||
      focus === "uncontacted" ||
      focus === "unassigned" ||
      focus === "no_action"
    ) {
      setQueueView(focus);
    }
  }, [focus]);
  const allLeads = useMemo(
    () =>
      cases
        .filter((item) => (item.qualificationStage ?? "lead") === "lead")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [cases]
  );
  useEffect(() => {
    let cancelled = false;
    opportunityService
      .leadSummary()
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cases.length]);
  const leads = useMemo(
    () =>
      allLeads
        .filter((item) => {
          const health = item.qualificationReadiness?.health;
          if (queueView === "today") return item.createdAt === new Date().toISOString().slice(0, 10);
          if (queueView === "sla_risk") {
            const nearLimit =
              health?.leadSlaHours != null &&
              health.leadStatusAgeHours != null &&
              health.leadStatusAgeHours >= health.leadSlaHours * 0.75;
            return Boolean(health?.leadSlaBreached || nearLimit || health?.actionOverdue);
          }
          if (queueView === "uncontacted") return !health?.firstContactAt;
          if (queueView === "unassigned") return !item.assignedUserId;
          if (queueView === "no_action") return !item.nextActionAt;
          if (queueView === "mine") return item.assignedUserId === user?.id;
          if (queueView === "waiting") return (item.leadFollowUpStatus ?? "new") === "waiting";
          if (queueView === "disqualified") return (item.leadFollowUpStatus ?? "new") === "disqualified";
          return true;
        })
        .filter((item) => status === "all" || (item.leadFollowUpStatus ?? "new") === status)
        .filter((item) => {
          const needle = query.trim().toLocaleLowerCase("tr-TR");
          if (!needle) return true;
          return [
            leadName(item),
            item.leadContactName,
            item.leadPhone,
            item.leadEmail,
            item.leadCity,
            item.leadDistrict,
            item.requestedProduct,
            item.externalMetadata?.boardName,
          ].some((value) => (value ?? "").toLocaleLowerCase("tr-TR").includes(needle));
        }),
    [allLeads, query, queueView, status, user?.id]
  );
  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        LEAD_FOLLOW_UP_STATUS_ORDER.map((item) => [
          item,
          allLeads.filter((lead) => (lead.leadFollowUpStatus ?? "new") === item).length,
        ])
      ) as Record<LeadFollowUpStatus, number>,
    [allLeads]
  );

  const convert = async (lead: SalesCase) => {
    if (busyId) return;
    setBusyId(lead.id);
    try {
      await convertCase(lead.id, "Lead havuzundan fırsata çevrildi");
      toast.success("Lead fırsata çevrildi", {
        description: `${leadName(lead)} · C aşamasına taşındı`,
      });
    } catch (error: any) {
      toast.error("Lead fırsata çevrilemedi", {
        description: error?.message ?? "Kayıt bilgilerini kontrol edin.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const assignOwner = async (lead: SalesCase, assignedUserId: string) => {
    if (busyId) return;
    setBusyId(lead.id);
    try {
      await updateCase(lead.id, { assignedUserId: assignedUserId === "__none__" ? "" : assignedUserId });
      toast.success("Lead sorumlusu güncellendi");
    } catch (error: any) {
      toast.error("Lead sorumlusu güncellenemedi", {
        description: error?.message ?? "İstek başarısız oldu.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const removeLead = async () => {
    if (!pendingDelete || busyId) return;
    const lead = pendingDelete;
    setBusyId(lead.id);
    try {
      await deleteCase(lead.id);
      setPendingDelete(null);
      toast.success("Lead kartı silindi", { description: leadName(lead) });
    } catch (error: any) {
      toast.error("Lead kartı silinemedi", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setBusyId(null);
    }
  };

  // Eleme nedeni zorunlu olduğu için "Uygun değil" seçimi doğrudan yazılmaz;
  // önce neden diyaloğu açılır.
  const [disqualifying, setDisqualifying] = useState<SalesCase | null>(null);

  const updateStatus = async (
    lead: SalesCase,
    nextStatus: LeadFollowUpStatus,
    extra?: { disqualifyReasonCode?: string; qualificationNote?: string }
  ) => {
    if (busyId) return;
    setBusyId(lead.id);
    try {
      await updateCase(lead.id, { leadFollowUpStatus: nextStatus, ...extra });
      toast.success("Lead durumu güncellendi", {
        description: `${leadName(lead)} · ${LEAD_FOLLOW_UP_STATUS_LABELS[nextStatus]}`,
      });
    } catch (error: any) {
      toast.error("Lead durumu güncellenemedi", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/15 bg-[linear-gradient(105deg,#000c69_0%,#10298f_62%,#d71920_160%)] text-white shadow-sm">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100">
              Gelen satış sinyalleri
            </div>
            <div className="mt-1 font-display text-3xl font-semibold leading-none">Lead çalışma kuyruğu</div>
            <p className="mt-2 max-w-xl text-sm leading-5 text-blue-100/90">
              Önce SLA riski ve temassız kayıtlar; sonra açıklanabilir uyum–etkileşim önceliği.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LeadCaptureDialog
              trigger={<Button className="bg-white text-primary hover:bg-blue-50">Hızlı Lead</Button>}
            />
            <TrelloCsvImportDialog />
          </div>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-white/15 sm:grid-cols-4">
            {[
              ["İlk temas", summary?.medianFirstContactHours == null ? "—" : `${summary.medianFirstContactHours} sa`, "30 günlük medyan"],
              ["SLA ihlali", String(summary?.slaBreaches ?? allLeads.filter((lead) => lead.qualificationReadiness?.health?.leadSlaBreached).length), "açık lead"],
              ["Dönüşüm", `%${summary?.conversionRate ?? 0}`, "30 günlük baz"],
              ["Sahipsiz", String(summary?.unassignedLeads ?? allLeads.filter((lead) => !lead.assignedUserId).length), "atama bekliyor"],
            ].map(([label, value, hint]) => (
              <div key={label} className="bg-[#07176f]/70 px-3 py-3">
                <div className="font-data text-[9px] uppercase tracking-[0.13em] text-blue-100">{label}</div>
                <div className="mt-1 font-data text-xl font-semibold tabular-nums">{value}</div>
                <div className="text-[9px] text-blue-100/75">{hint}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3 rounded-xl border border-border/70 bg-white p-3 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Firma, kontak, telefon veya ürün ara..."
              className="h-11 bg-white pl-9 sm:h-9"
            />
          </div>
          <Badge variant="outline" className="hidden h-7 shrink-0 sm:inline-flex">
            {leads.length} kayıt
          </Badge>
        </div>
        <div className="flex gap-1.5 overflow-x-auto border-t border-border/60 pt-3" aria-label="Hazır lead görünümleri">
          {QUEUE_VIEWS.map((view) => (
            <Button
              key={view.value}
              type="button"
              size="sm"
              variant={queueView === view.value ? "default" : "ghost"}
              className="h-11 shrink-0 px-3 text-[11px] sm:h-8"
              onClick={() => setQueueView(view.value)}
            >
              {view.value === "sla_risk" && <Zap className="size-3.5" />}
              {view.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Lead durumu filtresi">
          <Button
            type="button"
            size="sm"
            variant={status === "all" ? "default" : "outline"}
            className="h-11 shrink-0 px-2.5 text-[10px] sm:h-7"
            onClick={() => setStatus("all")}
          >
            Tümü <span className="font-data opacity-75">{allLeads.length}</span>
          </Button>
          {LEAD_FOLLOW_UP_STATUS_ORDER.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant="outline"
              className={`h-11 shrink-0 px-2.5 text-[10px] sm:h-7 ${status === item ? LEAD_FOLLOW_UP_STATUS_STYLES[item] : ""}`}
              onClick={() => setStatus(item)}
            >
              {LEAD_FOLLOW_UP_STATUS_LABELS[item]} <span className="font-data opacity-70">{statusCounts[item]}</span>
            </Button>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <Card className="border-border/70">
          <EmptyState
            scene="search"
            eyebrow="Lead havuzu"
            title="Bekleyen lead yok"
            description="Yeni bir lead ekleyin veya gelen kayıtlardan birini bu havuza aktarın."
          />
        </Card>
      ) : (
        <>
        <Card className="hidden overflow-hidden border-border/70 lg:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="w-[112px]">Öncelik</TableHead>
                <TableHead>Lead / konu</TableHead>
                <TableHead>Sorumlu</TableHead>
                <TableHead>Sonraki aksiyon</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Kaynak</TableHead>
                <TableHead className="text-right">Uyum · Etkileşim</TableHead>
                <TableHead className="w-[82px]"><span className="sr-only">İşlemler</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const owner = users.find((candidate) => candidate.id === lead.assignedUserId);
                const health = lead.qualificationReadiness?.health;
                return (
                  <TableRow key={lead.id} className="cursor-pointer" onClick={() => onSelect(lead)}>
                    <TableCell>
                      <Badge variant="outline" className={priorityStyle(lead)}>
                        <span className="font-data tabular-nums">{lead.leadInsights?.priorityScore ?? 0}</span>
                        <span className="ml-1">{priorityLabel(lead)}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[260px] truncate text-sm font-semibold">{leadName(lead)}</div>
                      <div className="mt-0.5 max-w-[260px] truncate text-[10px] text-muted-foreground">
                        {lead.leadContactName || "Kontak yok"} · {lead.requestedMachine || lead.requestedProduct || "Konu yok"}
                      </div>
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      {canAssignOwner ? (
                        <Select
                          value={lead.assignedUserId || "__none__"}
                          disabled={busyId === lead.id}
                          onValueChange={(value) => void assignOwner(lead, value)}
                        >
                          <SelectTrigger size="sm" className="h-8 w-[160px] bg-white text-xs" aria-label={`${leadName(lead)} sorumlusu`}>
                            <SelectValue placeholder="Sahipsiz" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sahipsiz</SelectItem>
                            {users.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6"><AvatarFallback className="text-[8px]">{initials(owner?.name ?? "—")}</AvatarFallback></Avatar>
                          <span className="max-w-[130px] truncate text-xs">{owner?.name || "Sahipsiz"}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className={`max-w-[210px] truncate text-xs ${isActionOverdue(lead.nextActionAt) ? "font-semibold text-red-700" : ""}`}>
                        {lead.nextAction || "Planlanmadı"}
                      </div>
                      <div className="mt-0.5 text-[9px] text-muted-foreground">{actionDateLabel(lead.nextActionAt)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={health?.leadSlaBreached ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                        {health?.leadSlaBreached ? "Aşıldı" : `${health?.leadStatusAgeHours ?? 0} sa`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{lead.leadContactMethodName || lead.externalSource || "Manuel"}</TableCell>
                    <TableCell className="text-right font-data text-xs tabular-nums">
                      {lead.leadInsights?.fitScore ?? 0} · {lead.leadInsights?.engagementScore ?? 0}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(lead);
                        }}
                      >
                        İncele
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
        <div className="grid gap-3 lg:hidden">
          {leads.map((lead) => {
            const owner = users.find((user) => user.id === lead.assignedUserId);
            const missing = missingLeadFields(lead);
            const leadStatus = lead.leadFollowUpStatus ?? "new";
            const overdue = isActionOverdue(lead.nextActionAt);
            const health = lead.qualificationReadiness?.health;
            return (
              <Card
                key={lead.id}
                className="group overflow-hidden border-border/75 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <button type="button" className="w-full text-left" onClick={() => onSelect(lead)}>
                  <div className="h-1 bg-[linear-gradient(90deg,#64748b_0%,#64748b_64%,#000c69_64%,#000c69_82%,#d71920_82%)]" />
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                        {lead.leadCompanyTitle ? <Building2 className="size-5" /> : <UserRound className="size-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold group-hover:text-primary">{leadName(lead)}</h3>
                          <Badge variant="outline" className={`h-5 text-[9px] ${priorityStyle(lead)}`}>
                            {lead.leadInsights?.priorityScore ?? 0} · {priorityLabel(lead)}
                          </Badge>
                          <Badge variant="outline" className={`h-5 text-[9px] ${LEAD_FOLLOW_UP_STATUS_STYLES[leadStatus]}`}>
                            {LEAD_FOLLOW_UP_STATUS_LABELS[leadStatus]}
                          </Badge>
                          {health?.leadSlaBreached && (
                            <Badge
                              variant="outline"
                              className="h-5 shrink-0 border-red-200 bg-red-50 text-[9px] text-red-700"
                              title={`Bu durumda ${health.leadStatusAgeHours} saattir bekliyor (hedef ${health.leadSlaHours} saat)`}
                            >
                              SLA aşıldı
                            </Badge>
                          )}
                          {health?.attemptLimitReached && (
                            <Badge
                              variant="outline"
                              className="h-5 shrink-0 border-amber-200 bg-amber-50 text-[9px] text-amber-700"
                              title="Temas deneme sınırına ulaşıldı; beklemeye alın veya eleyin"
                            >
                              {health.contactAttemptCount} deneme
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {lead.leadContactName || "Kontak belirtilmedi"} · {lead.requestedProduct || "Konu bekleniyor"}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Phone className="size-3.5 shrink-0" />
                        <span className="truncate">{lead.leadPhone || lead.leadContactValue || "Telefon yok"}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Mail className="size-3.5 shrink-0" />
                        <span className="truncate">{lead.leadEmail || "E-posta yok"}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {[lead.leadCity, lead.leadDistrict].filter(Boolean).join(" / ") || "Konum yok"}
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Avatar className="size-4">
                          <AvatarFallback className="bg-primary/10 text-[7px] text-primary">
                            {initials(owner?.name ?? "—")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{owner?.name || "Atanmadı"}</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border-l-2 border-[#2457D6] pl-2"><div className="text-[9px] uppercase text-muted-foreground">Uyum</div><div className="font-data text-sm font-semibold">{lead.leadInsights?.fitScore ?? 0}</div></div>
                      <div className="border-l-2 border-[#0b2453] pl-2"><div className="text-[9px] uppercase text-muted-foreground">Etkileşim</div><div className="font-data text-sm font-semibold">{lead.leadInsights?.engagementScore ?? 0}</div></div>
                    </div>

                    <div className={`rounded-r-lg border-l-[3px] px-3 py-2.5 ${overdue ? "border-red-500 bg-red-50/70" : "border-primary bg-blue-50/65"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 font-data text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          <AlarmClock className="size-3.5 text-primary" /> Sonraki aksiyon
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[9px] ${overdue ? "font-semibold text-red-700" : "text-muted-foreground"}`}>
                          <CalendarClock className="size-3" />
                          {overdue ? "Gecikti · " : ""}{actionDateLabel(lead.nextActionAt)}
                        </span>
                      </div>
                      <div className={`mt-1 line-clamp-2 text-[11px] ${lead.nextAction ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {lead.nextAction || "İlk temas için yapılacak işi planlayın."}
                      </div>
                    </div>

                    <div className="flex min-h-7 flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
                      {missing.length ? (
                        <>
                          <CircleAlert className="size-3.5 text-amber-600" />
                          {missing.map((field) => (
                            <span key={field} className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700">
                              {field} eksik
                            </span>
                          ))}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                          <CheckCircle2 className="size-3.5" /> Temel bilgiler hazır
                        </span>
                      )}
                    </div>
                  </CardContent>
                </button>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5">
                  <span className="font-data text-[9px] uppercase tracking-wide text-muted-foreground">
                    {lead.leadContactMethodName || lead.externalSource || "Manuel"} · {lead.createdAt}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                    {canAssignOwner && (
                      <Select
                        value={lead.assignedUserId || "__none__"}
                        disabled={busyId === lead.id}
                        onValueChange={(value) => void assignOwner(lead, value)}
                      >
                        <SelectTrigger size="sm" className="h-11 w-[148px] bg-white text-[9px] sm:h-8" aria-label={`${leadName(lead)} sorumlusu`}>
                          <SelectValue placeholder="Sorumlu" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sahipsiz</SelectItem>
                          {users.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {canConvert && (
                      <Select
                        value={leadStatus}
                        disabled={busyId === lead.id}
                        onValueChange={(value) => {
                          if (value === "disqualified") {
                            setDisqualifying(lead);
                            return;
                          }
                          void updateStatus(lead, value as LeadFollowUpStatus);
                        }}
                      >
                        <SelectTrigger size="sm" className="h-11 w-[154px] bg-white text-[9px] sm:h-8" aria-label={`${leadName(lead)} lead durumu`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_FOLLOW_UP_STATUS_ORDER.map((item) => (
                            <SelectItem key={item} value={item}>{LEAD_FOLLOW_UP_STATUS_LABELS[item]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {canConvert && (
                      <NextActionDialog
                        salesCase={lead}
                        onSave={(patch) => updateCase(lead.id, patch)}
                        trigger={
                          <Button type="button" variant="outline" size="icon" className="size-11 bg-white sm:size-8" title="Sonraki aksiyonu planla">
                            <AlarmClock className="size-3.5" />
                            <span className="sr-only">Sonraki aksiyonu planla</span>
                          </Button>
                        }
                      />
                    )}
                    {canConvert && leadStatus !== "disqualified" && (
                    <Button
                      size="sm"
                      className="h-11 gap-1.5 sm:h-8"
                      disabled={busyId === lead.id}
                      onClick={() => void convert(lead)}
                    >
                      {busyId === lead.id ? "Çevriliyor…" : "Fırsata çevir"}
                      <ArrowRight className="size-3.5" />
                    </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:size-8"
                        title="Lead kartını sil"
                        aria-label={`${leadName(lead)} lead kartını sil`}
                        disabled={busyId === lead.id}
                        onClick={() => setPendingDelete(lead)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        </>
      )}

      <LeadDisqualifyDialog
        open={Boolean(disqualifying)}
        onOpenChange={(next) => { if (!next) setDisqualifying(null); }}
        leadName={disqualifying ? leadName(disqualifying) : ""}
        onConfirm={async ({ reasonCode, note }) => {
          if (!disqualifying) return;
          await updateStatus(disqualifying, "disqualified", {
            disqualifyReasonCode: reasonCode,
            qualificationNote: note,
          });
          setDisqualifying(null);
        }}
      />
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && !busyId && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lead kartı silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{pendingDelete ? leadName(pendingDelete) : "Lead"}</b> kartı aktif lead havuzundan kaldırılacak.
              Bağlı aktivite ve denetim kayıtları veri bütünlüğü için korunur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(busyId)}
              onClick={(event) => {
                event.preventDefault();
                void removeLead();
              }}
            >
              {busyId ? "Siliniyor…" : "Lead Kartını Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
