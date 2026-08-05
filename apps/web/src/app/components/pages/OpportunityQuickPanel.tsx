import { useMemo, useState, type Ref } from "react";
import {
  AlarmClock,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarPlus,
  Check,
  Clock3,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
import {
  QUALIFICATION_STAGE_LABELS,
  salesStageLabel,
  type SalesCase,
} from "../../lib/mock";
import { AddActivityDialog } from "../dialogs/CreateDialogs";
import { ComposeMailDialog, type MailRecipient } from "../mail/ComposeMailDialog";
import { Button } from "../ui/button";
import { StatusBadge } from "../Layout";
import { NextActionDialog, actionDateLabel, isActionOverdue } from "../shared/NextActionDialog";
import { CommercialDocumentRail } from "../shared/CommercialDocumentRail";
import { normalizeWhatsAppNumber, resolveSalesContact } from "../../lib/salesContact";

type OpportunityQuickPanelProps = {
  salesCase: SalesCase;
  onClose: () => void;
  onOpenWorkspace: (target?: "overview" | "commercial" | "process" | "records") => void;
  previous?: SalesCase | null;
  next?: SalesCase | null;
  onNavigate?: (opportunityId: string) => void;
  workspaceButtonRef?: Ref<HTMLButtonElement>;
  simpleMode?: boolean;
};

const money = (value: number, currency: SalesCase["currency"]) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const dateLabel = (value?: string) => {
  if (!value) return "Belirlenmedi";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Belirlenmedi";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

export { normalizeWhatsAppNumber };

function PulseCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "before:bg-slate-300",
    good: "before:bg-emerald-500",
    warning: "before:bg-amber-500",
    danger: "before:bg-red-500",
  }[tone];

  return (
    <div className={`relative min-w-0 px-3 py-3 before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${toneClass}`}>
      <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-xs font-semibold text-foreground" title={value}>
        {value}
      </div>
    </div>
  );
}

function OpportunityQuickPanelLegacy({ salesCase: sc, onClose, onOpenWorkspace, previous, next, onNavigate, workspaceButtonRef }: OpportunityQuickPanelProps) {
  const { customers, contacts, users, activities, offers, documents, updateCase } = useStore();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission("opportunities.update");
  const [mailRecipient, setMailRecipient] = useState<MailRecipient | null>(null);

  const customer = customers.find((item) => item.id === sc.customerId);
  const resolvedContact = resolveSalesContact({ salesCase: sc, customer, contacts });
  const { primaryContact } = resolvedContact;
  const owner = users.find((user) => user.id === sc.assignedUserId);
  const contactName = resolvedContact.name;
  const contactPhone = resolvedContact.phone;
  const contactEmail = resolvedContact.email;
  const whatsappNumber = resolvedContact.whatsappNumber;
  const partyName = customer?.name || sc.leadCompanyTitle || sc.leadContactName || "Firma kaydı bekliyor";
  const probability = Math.min(100, Math.max(0, sc.probability ?? 50));
  const weightedValue = sc.estimatedAmount * (probability / 100);
  const health = sc.qualificationReadiness?.health;
  const overdue = isActionOverdue(sc.nextActionAt) || Boolean(health?.actionOverdue);
  const attentionNeeded = Boolean(health?.rotting || health?.leadSlaBreached || health?.attemptLimitReached);
  const actionMissing = !sc.nextAction || Boolean(health?.actionMissing);
  const pulseTone = overdue || attentionNeeded ? "danger" : actionMissing ? "warning" : "good";
  const pulseLabel = overdue
    ? "Aksiyon gecikti"
    : health?.rotting
      ? "Aşama yaşlandı"
      : health?.leadSlaBreached
        ? "Lead SLA aşıldı"
        : actionMissing
          ? "Aksiyon eksik"
          : "Plan yolunda";
  const opportunityActivities = useMemo(
    () =>
      activities
        .filter((activity) => activity.salesCaseId === sc.id)
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3),
    [activities, sc.id],
  );
  const opportunityOffers = offers.filter((offer) => offer.salesCaseId === sc.id);
  const opportunityDocuments = documents.filter((document) => document.salesCaseId === sc.id);
  const offerCount = opportunityOffers.length;
  const documentCount = opportunityDocuments.length;
  const shortId = sc.id.slice(0, 8).toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f8fa]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-data text-[10px] font-semibold uppercase tracking-[0.16em] text-[#536178]">
                Fırsat · {shortId}
              </span>
              <StatusBadge status={sc.stage} />
            </div>
            <h2 className="mt-2 break-words font-display text-[25px] font-semibold leading-[1.05] tracking-[-0.02em] text-[#0b1739]">
              {partyName}
            </h2>
            <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
              {[sc.requestedProduct, sc.requestedModel, sc.quantity ? `${sc.quantity} adet` : null]
                .filter(Boolean)
                .join(" · ") || "Satış konusu henüz belirtilmedi"}
            </p>
          </div>
          <div className="-mr-2 -mt-2 flex shrink-0 items-center gap-0.5">
            {onNavigate && <><Button type="button" variant="ghost" size="icon" disabled={!previous} onClick={() => previous && onNavigate(previous.id)} aria-label="Önceki fırsat" title="Önceki fırsat"><ChevronLeft className="size-4" /></Button><Button type="button" variant="ghost" size="icon" disabled={!next} onClick={() => next && onNavigate(next.id)} aria-label="Sonraki fırsat" title="Sonraki fırsat"><ChevronRight className="size-4" /></Button></>}
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fırsat panelini kapat"><X className="size-4" /></Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-4 sm:px-6">
          <section aria-labelledby="opportunity-pulse-title">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 id="opportunity-pulse-title" className="font-data text-[10px] font-semibold uppercase tracking-[0.15em] text-[#536178]">
                Fırsat nabzı
              </h3>
              <span className={`text-[10px] font-semibold ${pulseTone === "danger" ? "text-red-700" : pulseTone === "warning" ? "text-amber-700" : "text-emerald-700"}`}>
                {pulseLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:grid-cols-4 sm:divide-x sm:divide-slate-200">
              <PulseCell label="Nitelik" value={QUALIFICATION_STAGE_LABELS[sc.qualificationStage] ?? sc.qualificationStage} />
              <PulseCell label="Operasyon" value={salesStageLabel(sc.stage)} />
              <PulseCell
                label="Aşama yaşı"
                value={health?.stageAgeDays == null ? "—" : `${health.stageAgeDays} gün`}
                tone={health?.rotting ? "danger" : "neutral"}
              />
              <PulseCell label="Takip" value={pulseLabel} tone={pulseTone} />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]" aria-label="Ticari özet">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
              <div>
                <div className="text-[10px] font-medium text-muted-foreground">Tahmini değer</div>
                <div className="mt-1 font-data text-base font-semibold tabular-nums text-[#0b1739]">{money(sc.estimatedAmount, sc.currency)}</div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground">Olasılık</div>
                <div className="mt-1 font-data text-base font-semibold tabular-nums text-[#0b1739]">%{probability}</div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground">Ağırlıklı değer</div>
                <div className="mt-1 font-data text-base font-semibold tabular-nums text-[#0b1739]">{money(weightedValue, sc.currency)}</div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground">Beklenen kapanış</div>
                <div className="mt-1 text-sm font-semibold text-[#0b1739]">{dateLabel(sc.expectedCloseDate)}</div>
              </div>
            </div>
          </section>

          {sc.qualificationStage !== "lead" && (
            <CommercialDocumentRail
              variant="compact"
              offers={opportunityOffers}
              documents={opportunityDocuments}
              onOpenOffer={() => onOpenWorkspace("commercial")}
              onOpenDocument={() => onOpenWorkspace("commercial")}
            />
          )}

          <section className={`overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${overdue ? "border-red-200" : actionMissing ? "border-amber-200" : "border-slate-200"}`} aria-labelledby="next-action-title">
            <div className={`h-1 ${overdue ? "bg-red-500" : actionMissing ? "bg-amber-500" : "bg-[#163b75]"}`} />
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 id="next-action-title" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b1739]">
                  <AlarmClock className="size-4" /> Sonraki aksiyon
                </h3>
                <span className={`inline-flex items-center gap-1 text-[10px] ${overdue ? "font-semibold text-red-700" : "text-muted-foreground"}`}>
                  <Clock3 className="size-3" /> {overdue ? "Gecikti · " : ""}{actionDateLabel(sc.nextActionAt)}
                </span>
              </div>
              <p className={`mt-2 text-sm leading-5 ${sc.nextAction ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {sc.nextAction || "Bu fırsat için henüz somut bir sonraki adım planlanmadı."}
              </p>
              {canUpdate && (
                <NextActionDialog
                  salesCase={sc}
                  onSave={(patch) => updateCase(sc.id, patch)}
                  trigger={
                    <Button type="button" variant="outline" size="sm" className="mt-3 h-8 gap-1.5 text-xs">
                      <CalendarDays className="size-3.5" />
                      {sc.nextAction ? "Aksiyonu düzenle" : "Aksiyon planla"}
                    </Button>
                  }
                />
              )}
            </div>
          </section>

          <section aria-labelledby="quick-actions-title">
            <h3 id="quick-actions-title" className="mb-2 font-data text-[10px] font-semibold uppercase tracking-[0.15em] text-[#536178]">
              Hızlı iletişim
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {contactPhone ? (
                <Button asChild variant="outline" className="h-10 justify-start gap-2 bg-white text-xs">
                  <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}><Phone className="size-4 text-[#163b75]" /> Ara</a>
                </Button>
              ) : (
                <Button variant="outline" className="h-10 justify-start gap-2 bg-white text-xs" disabled><Phone className="size-4" /> Ara</Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-10 justify-start gap-2 bg-white text-xs"
                disabled={!contactEmail}
                onClick={() => contactEmail && setMailRecipient({
                  email: contactEmail,
                  name: contactName,
                  companyId: sc.customerId || undefined,
                  contactId: primaryContact?.id,
                })}
              >
                <Mail className="size-4 text-[#163b75]" /> E-posta
              </Button>
              {whatsappNumber ? (
                <Button asChild variant="outline" className="h-10 justify-start gap-2 bg-white text-xs">
                  <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer"><MessageCircle className="size-4 text-emerald-600" /> WhatsApp</a>
                </Button>
              ) : (
                <Button variant="outline" className="h-10 justify-start gap-2 bg-white text-xs" disabled><MessageCircle className="size-4" /> WhatsApp</Button>
              )}
              <AddActivityDialog
                salesCaseId={sc.id}
                customerId={sc.customerId}
                defaultTypeCode="online_meeting"
                trigger={
                  <Button variant="outline" className="h-10 justify-start gap-2 bg-white text-xs">
                    <CalendarPlus className="size-4 text-[#163b75]" /> Toplantı
                  </Button>
                }
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]" aria-labelledby="contact-summary-title">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#eaf0f8] text-[#163b75]">
                <UserRound className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="contact-summary-title" className="text-xs font-semibold text-[#0b1739]">{contactName}</h3>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {[primaryContact?.title, contactPhone, contactEmail].filter(Boolean).join(" · ") || "İletişim bilgisi eklenmedi"}
                </p>
              </div>
              <div className="text-right text-[10px] text-muted-foreground">
                <div>Sorumlu</div>
                <div className="mt-0.5 max-w-32 truncate font-medium text-foreground">{owner?.name || "Atanmadı"}</div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]" aria-labelledby="recent-activity-title">
            <div className="flex items-center justify-between gap-3">
              <h3 id="recent-activity-title" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b1739]">
                <BriefcaseBusiness className="size-4" /> Son hareketler
              </h3>
              <span className="text-[10px] text-muted-foreground">{offerCount} teklif · {documentCount} belge</span>
            </div>
            {opportunityActivities.length ? (
              <div className="mt-3 divide-y divide-slate-100">
                {opportunityActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#315b91]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-foreground">{activity.title}</div>
                      <div className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{activity.result || activity.note || activity.type}</div>
                    </div>
                    <span className="shrink-0 font-data text-[9px] text-muted-foreground">{dateLabel(activity.date)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Henüz aktivite kaydı yok. İlk görüşmeyi hızlı iletişim alanından ekleyin.</p>
            )}
          </section>
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
        <Button ref={workspaceButtonRef} type="button" className="h-11 w-full justify-between bg-[#0b2453] px-4 hover:bg-[#102f68]" onClick={() => onOpenWorkspace("overview")}>
          <span>Tam çalışma alanını aç</span>
          <ArrowUpRight className="size-4" />
        </Button>
      </footer>

      <ComposeMailDialog recipient={mailRecipient} onOpenChange={(open) => !open && setMailRecipient(null)} />
    </div>
  );
}

const qualificationSteps = [
  { key: "c", label: "C" },
  { key: "b", label: "B" },
  { key: "a", label: "A" },
  { key: "a_plus", label: "A+" },
  { key: "win", label: "WIN" },
] as const;

function CompactQualificationRail({ salesCase: sc }: { salesCase: SalesCase }) {
  const activeIndex = qualificationSteps.findIndex((step) => step.key === sc.qualificationStage);
  const safeActiveIndex = activeIndex < 0 ? 0 : activeIndex;
  // Kontroller hiç gelmediyse `null`: "veri yok" ile "hepsi tamam" ekranda aynı
  // görünmemeli. Aksi halde okunamayan bir readiness yeşil rozet olarak çıkıyor.
  const checks = sc.qualificationReadiness?.checks;
  const missingConditions = checks ? checks.filter((check) => !check.complete).length : null;
  const completedCount = safeActiveIndex;

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
      aria-label={`Nitelik süreci: ${qualificationSteps.length} aşamadan ${completedCount} tanesi tamamlandı, şu an ${qualificationSteps[safeActiveIndex]?.label ?? ""}`}
    >
      <div className="relative grid grid-cols-5">
        <div aria-hidden className="absolute left-[10%] right-[10%] top-4 h-px bg-slate-200" />
        <div
          aria-hidden
          className="absolute left-[10%] top-4 h-px bg-[#174ea6] transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(safeActiveIndex / (qualificationSteps.length - 1)) * 80}%` }}
        />
        {qualificationSteps.map((step, index) => {
          const current = index === safeActiveIndex;
          const complete = index < safeActiveIndex;
          return (
            <div key={step.key} className="relative z-10 flex flex-col items-center gap-1.5">
              <span
                className={`grid size-8 place-items-center rounded-full border text-[10px] font-bold transition-colors motion-reduce:transition-none ${
                  current
                    ? "border-[#174ea6] bg-[#174ea6] text-white shadow-[0_4px_12px_rgba(23,78,166,0.25)]"
                    : complete
                      ? "border-[#0b2453] bg-[#0b2453] text-white"
                      : "border-slate-200 bg-white text-slate-600"
                }`}
                aria-current={current ? "step" : undefined}
              >
                {step.label}
                {/* Durum yalnız renkle aktarılmamalı: ekran okuyucu "C B A A+ WIN"
                    düz dizisi yerine aşama durumunu da duymalı (WCAG 1.4.1). */}
                <span className="sr-only">
                  {current ? " — mevcut aşama" : complete ? " — tamamlandı" : " — bekliyor"}
                </span>
              </span>
              {/* Renk körü kullanıcı için ikinci sinyal: iki koyu lacivert tonu
                  (tamamlanmış vs mevcut) tek başına ayırt edilemiyor. */}
              <Check
                aria-hidden="true"
                className={`size-3 ${complete ? "text-[#0b2453]" : "invisible"}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px]">
        <span className="font-semibold text-[#174ea6]">
          {QUALIFICATION_STAGE_LABELS[sc.qualificationStage] ?? sc.qualificationStage}
          {sc.qualificationReadiness?.health?.stageAgeDays != null && (
            <span className="font-normal text-muted-foreground"> · {sc.qualificationReadiness.health.stageAgeDays} gündür</span>
          )}
        </span>
        {missingConditions === null ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">Kontroller doğrulanmadı</span>
        ) : missingConditions > 0 ? (
          <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">{missingConditions} koşul eksik</span>
        ) : (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">Koşullar tamam</span>
        )}
      </div>
    </section>
  );
}

function SimpleOpportunityQuickPanel({ salesCase: sc, onClose, onOpenWorkspace, previous, next, onNavigate, workspaceButtonRef }: OpportunityQuickPanelProps) {
  const { customers, contacts, users, activities, offers, documents, updateCase } = useStore();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission("opportunities.update");
  const [mailRecipient, setMailRecipient] = useState<MailRecipient | null>(null);

  const customer = customers.find((item) => item.id === sc.customerId);
  const resolvedContact = resolveSalesContact({ salesCase: sc, customer, contacts });
  const { primaryContact } = resolvedContact;
  const owner = users.find((user) => user.id === sc.assignedUserId);
  const contactName = resolvedContact.name;
  const contactPhone = resolvedContact.phone;
  const contactEmail = resolvedContact.email;
  const whatsappNumber = resolvedContact.whatsappNumber;
  const partyName = customer?.name || sc.leadCompanyTitle || sc.leadContactName || "Firma kaydı bekliyor";
  const probability = Math.min(100, Math.max(0, sc.probability ?? 50));
  const weightedValue = sc.estimatedAmount * (probability / 100);
  const health = sc.qualificationReadiness?.health;
  const overdue = isActionOverdue(sc.nextActionAt) || Boolean(health?.actionOverdue);
  const actionMissing = !sc.nextAction || Boolean(health?.actionMissing);
  const opportunityActivities = useMemo(
    () =>
      activities
        .filter((activity) => activity.salesCaseId === sc.id)
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3),
    [activities, sc.id],
  );
  const opportunityOffers = offers.filter((offer) => offer.salesCaseId === sc.id);
  const opportunityDocuments = documents.filter((document) => document.salesCaseId === sc.id);
  const shortId = sc.externalKey || sc.id.slice(0, 8).toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f5f7fa]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-[#536178]">
              Fırsat · {shortId}
            </div>
            <div className="mt-3 flex min-w-0 items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-[#174ea6]">
                <Building2 className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="break-words font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[#0b1739]">{partyName}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {[sc.requestedProduct, sc.requestedModel, sc.quantity ? `${sc.quantity} adet` : null].filter(Boolean).join(" · ") || "Satış konusu henüz belirtilmedi"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" />{owner?.name || "Sorumlu atanmadı"}</span>
                  <span className="font-data font-semibold tabular-nums text-[#0b1739]">{money(sc.estimatedAmount, sc.currency)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="-mr-2 -mt-2 flex shrink-0 items-center gap-0.5">
            {onNavigate && (
              <>
                <Button type="button" variant="ghost" size="icon" disabled={!previous} onClick={() => previous && onNavigate(previous.id)} aria-label="Önceki fırsat" title="Önceki fırsat"><ChevronLeft className="size-4" /></Button>
                <Button type="button" variant="ghost" size="icon" disabled={!next} onClick={() => next && onNavigate(next.id)} aria-label="Sonraki fırsat" title="Sonraki fırsat"><ChevronRight className="size-4" /></Button>
              </>
            )}
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fırsat panelini kapat"><X className="size-4" /></Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <CompactQualificationRail salesCase={sc} />

          <section className={`overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${overdue ? "border-red-200" : actionMissing ? "border-amber-200" : "border-slate-200"}`} aria-labelledby="simple-next-action-title">
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 id="simple-next-action-title" className="inline-flex items-center gap-2 text-xs font-semibold text-[#0b1739]">
                  <span className={`grid size-8 place-items-center rounded-lg ${overdue ? "bg-red-50 text-red-700" : "bg-blue-50 text-[#174ea6]"}`}><CalendarDays className="size-4" /></span>
                  Bugün ne yapılmalı?
                </h3>
                <span className={`inline-flex items-center gap-1 text-[10px] ${overdue ? "font-semibold text-red-700" : "text-muted-foreground"}`}>
                  <Clock3 className="size-3" /> {overdue ? "Gecikti · " : ""}{actionDateLabel(sc.nextActionAt)}
                </span>
              </div>
              <p className={`mt-3 text-base leading-6 ${sc.nextAction ? "font-semibold text-[#0b1739]" : "text-sm text-muted-foreground"}`}>
                {sc.nextAction || "Bu fırsat için henüz somut bir sonraki adım planlanmadı."}
              </p>
              {canUpdate && (
                <NextActionDialog
                  salesCase={sc}
                  onSave={(patch) => updateCase(sc.id, patch)}
                  trigger={
                    <Button type="button" className="mt-4 h-11 w-full bg-[#0b2453] text-xs hover:bg-[#102f68]" data-opportunity-primary="true">
                      <CalendarDays className="mr-2 size-4" />
                      {sc.nextAction ? "Aksiyonu yeniden planla" : "Aksiyon planla"}
                    </Button>
                  }
                />
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]" aria-labelledby="simple-commercial-summary-title">
            <h3 id="simple-commercial-summary-title" className="mb-3 font-data text-[10px] font-semibold uppercase tracking-[0.15em] text-[#536178]">Kısa özet</h3>
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-slate-100">
              {[
                ["Değer", money(sc.estimatedAmount, sc.currency)],
                ["Olasılık", `%${probability}`],
                ["Ağırlıklı", money(weightedValue, sc.currency)],
                ["Kapanış", dateLabel(sc.expectedCloseDate)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 px-2 first:pl-0 last:pr-0">
                  <div className="truncate font-data text-sm font-semibold tabular-nums text-[#0b1739]" title={value}>{value}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </section>

          <CommercialDocumentRail
            variant="compact"
            offers={opportunityOffers}
            documents={opportunityDocuments}
            onOpenOffer={() => onOpenWorkspace("commercial")}
            onOpenDocument={() => onOpenWorkspace("commercial")}
          />

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]" aria-labelledby="simple-recent-activity-title">
            <div className="flex items-center justify-between gap-3">
              <h3 id="simple-recent-activity-title" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b1739]"><BriefcaseBusiness className="size-4" /> Son hareketler</h3>
              <span className="text-[10px] font-semibold text-[#174ea6]">{opportunityActivities.length} kayıt</span>
            </div>
            {opportunityActivities.length ? (
              <div className="mt-3 divide-y divide-slate-100">
                {opportunityActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#174ea6]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-foreground">{activity.title}</div>
                      <div className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{activity.result || activity.note || activity.type}</div>
                    </div>
                    <span className="shrink-0 font-data text-[9px] text-muted-foreground">{dateLabel(activity.date)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Henüz aktivite kaydı yok.</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]" aria-labelledby="simple-contact-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 id="simple-contact-title" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b1739]"><UserRound className="size-4" /> İletişim</h3>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{contactName}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {contactPhone ? (
                <Button asChild variant="outline" className="h-11 gap-2 bg-white text-xs"><a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}><Phone className="size-4 text-[#174ea6]" /> Ara</a></Button>
              ) : (
                <Button variant="outline" className="h-11 gap-2 bg-white text-xs" disabled><Phone className="size-4" /> Ara</Button>
              )}
              <Button type="button" variant="outline" className="h-11 gap-2 bg-white text-xs" disabled={!contactEmail} onClick={() => contactEmail && setMailRecipient({ email: contactEmail, name: contactName, companyId: sc.customerId || undefined, contactId: primaryContact?.id })}>
                <Mail className="size-4 text-[#174ea6]" /> E-posta
              </Button>
              {whatsappNumber ? (
                <Button asChild variant="outline" className="h-11 gap-2 bg-white text-xs"><a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer"><MessageCircle className="size-4 text-emerald-600" /> WhatsApp</a></Button>
              ) : (
                <Button variant="outline" className="h-11 gap-2 bg-white text-xs" disabled><MessageCircle className="size-4" /> WhatsApp</Button>
              )}
              <AddActivityDialog salesCaseId={sc.id} customerId={sc.customerId} defaultTypeCode="online_meeting" trigger={<Button className="h-11 gap-2 bg-white text-xs" variant="outline"><CalendarPlus className="size-4 text-[#174ea6]" /> Toplantı</Button>} />
            </div>
          </section>
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
        <Button ref={workspaceButtonRef} type="button" variant="outline" className="h-11 w-full justify-between border-[#9aa9bd] bg-white px-4 text-[#0b2453] hover:bg-slate-50" onClick={() => onOpenWorkspace("overview")}>
          <span>Tüm detayları aç</span>
          <ArrowUpRight className="size-4" />
        </Button>
      </footer>

      <ComposeMailDialog recipient={mailRecipient} onOpenChange={(open) => !open && setMailRecipient(null)} />
    </div>
  );
}

export function OpportunityQuickPanel(props: OpportunityQuickPanelProps) {
  return props.simpleMode ? <SimpleOpportunityQuickPanel {...props} /> : <OpportunityQuickPanelLegacy {...props} />;
}
