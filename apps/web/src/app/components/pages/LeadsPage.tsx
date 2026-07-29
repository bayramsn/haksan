import { useMemo, useState } from "react";
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
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
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

const initials = (value: string) =>
  (value || "—")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

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

export function LeadsPage({ onSelect }: { onSelect: (lead: SalesCase) => void }) {
  const { cases, users, convertCase, updateCase } = useStore();
  const { hasPermission } = useAuth();
  const canConvert = hasPermission("opportunities.update");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadFollowUpStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const allLeads = useMemo(
    () =>
      cases
        .filter((item) => (item.qualificationStage ?? "lead") === "lead")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [cases]
  );
  const leads = useMemo(
    () =>
      allLeads
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
            item.requestedProduct,
            item.externalMetadata?.boardName,
          ].some((value) => (value ?? "").toLocaleLowerCase("tr-TR").includes(needle));
        }),
    [allLeads, query, status]
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
        <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-end">
          <div>
            <div className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100">
              Gelen satış sinyalleri
            </div>
            <div className="mt-1 font-display text-3xl font-semibold leading-none">{allLeads.length} lead</div>
            <p className="mt-2 max-w-xl text-sm leading-5 text-blue-100/90">
              Telefon, e-posta, dijital pazar ve aktarımlardan gelen tüm kayıtlar burada toplanır.
              Değerlendirdiğiniz kayıt C aşamasında bir fırsata dönüşür.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LeadCaptureDialog
              trigger={<Button className="bg-white text-primary hover:bg-blue-50">Hızlı Lead</Button>}
            />
            <TrelloCsvImportDialog />
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
              className="h-9 bg-white pl-9"
            />
          </div>
          <Badge variant="outline" className="hidden h-7 shrink-0 sm:inline-flex">
            {leads.length} kayıt
          </Badge>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Lead durumu filtresi">
          <Button
            type="button"
            size="sm"
            variant={status === "all" ? "default" : "outline"}
            className="h-7 shrink-0 px-2.5 text-[10px]"
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
              className={`h-7 shrink-0 px-2.5 text-[10px] ${status === item ? LEAD_FOLLOW_UP_STATUS_STYLES[item] : ""}`}
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
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
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
                        <span className="truncate">{lead.leadCity || "Konum yok"}</span>
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
                        <SelectTrigger size="sm" className="h-8 w-[154px] bg-white text-[9px]">
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
                          <Button type="button" variant="outline" size="icon" className="size-8 bg-white" title="Sonraki aksiyonu planla">
                            <AlarmClock className="size-3.5" />
                            <span className="sr-only">Sonraki aksiyonu planla</span>
                          </Button>
                        }
                      />
                    )}
                    {canConvert && leadStatus !== "disqualified" && (
                    <Button
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busyId === lead.id}
                      onClick={() => void convert(lead)}
                    >
                      {busyId === lead.id ? "Çevriliyor…" : "Fırsata çevir"}
                      <ArrowRight className="size-3.5" />
                    </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
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
    </div>
  );
}
