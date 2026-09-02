import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  LeadContactChannelCode,
  LeadContactOutcomeCode,
} from "@haksan/shared";
import {
  AlarmClock,
  ArrowRight,
  ChevronDown,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Save,
  SlidersHorizontal,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { CreateContactDialog } from "../dialogs/CreateDialogs";
import { ComposeMailDialog, type MailRecipient } from "../mail/ComposeMailDialog";
import { ApiError } from "../../../lib/apiClient";
import { opportunityService } from "../../../lib/services";
import { useStore } from "../../lib/store";
import type { SalesCase, User } from "../../lib/mock";
import { NextActionDialog } from "../shared/NextActionDialog";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";

const CHANNEL_LABELS: Record<LeadContactChannelCode, string> = {
  phone: "Telefon",
  email: "E-posta",
  whatsapp: "WhatsApp",
};

const OUTCOME_LABELS: Record<LeadContactOutcomeCode, string> = {
  no_answer: "Yanıt yok",
  contacted: "Temas kuruldu",
  callback: "Geri arama istendi",
  requested_info: "Bilgi istendi",
  meeting_booked: "Toplantı planlandı",
  not_interested: "İlgilenmiyor",
  wrong_contact: "Yanlış kontak",
};

const localDateTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const newIdempotencyKey = () => {
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
};

function ContactResultDialog({
  open,
  onOpenChange,
  salesCase,
  initialChannel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesCase: SalesCase;
  initialChannel: LeadContactChannelCode;
}) {
  const { refresh } = useStore();
  const [channel, setChannel] = useState<LeadContactChannelCode>(initialChannel);
  const [outcome, setOutcome] = useState<LeadContactOutcomeCode>("contacted");
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState(salesCase.nextAction ?? "");
  const [nextActionAt, setNextActionAt] = useState(localDateTime(salesCase.nextActionAt));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!open) return;
    setChannel(initialChannel);
    setOutcome("contacted");
    setNote("");
    setNextAction(salesCase.nextAction ?? "");
    setNextActionAt(localDateTime(salesCase.nextActionAt));
    setFormError(null);
    idempotencyKeyRef.current = newIdempotencyKey();
  }, [initialChannel, open, salesCase.nextAction, salesCase.nextActionAt]);

  const save = async () => {
    if (saving) return;
    if (nextActionAt && !nextAction.trim()) {
      setFormError("Takip tarihi seçildiğinde sonraki aksiyon zorunludur.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await opportunityService.recordContact(salesCase.id, {
        idempotencyKey: idempotencyKeyRef.current,
        channel,
        outcome,
        note: note.trim() || undefined,
        nextAction: nextAction.trim() || null,
        nextActionAt: nextActionAt ? new Date(nextActionAt) : null,
      });
      await refresh();
      idempotencyKeyRef.current = newIdempotencyKey();
      onOpenChange(false);
      toast.success("Temas sonucu kaydedildi", {
        description: `${CHANNEL_LABELS[channel]} · ${OUTCOME_LABELS[outcome]}`,
      });
    } catch (error: any) {
      toast.error("Temas sonucu kaydedilemedi", {
        description: error?.message ?? "İstek başarısız oldu.",
      });
      setFormError(error?.message ?? "Temas sonucu kaydedilemedi. Taslağınız korunuyor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Temas sonucunu kaydet</DialogTitle>
          <DialogDescription>
            Sonuç, not ve yeni takip tarihini tek işlemde kaydeder; çift gönderim yeni aktivite oluşturmaz.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="lead-contact-channel">Kanal</Label>
            <Select value={channel} onValueChange={(value) => setChannel(value as LeadContactChannelCode)}>
              <SelectTrigger id="lead-contact-channel" className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="lead-contact-outcome">Sonuç</Label>
            <Select value={outcome} onValueChange={(value) => setOutcome(value as LeadContactOutcomeCode)}>
              <SelectTrigger id="lead-contact-outcome" className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="lead-contact-note">Kısa not</Label>
          <Textarea
            id="lead-contact-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            className="mt-1.5 min-h-20"
            placeholder="Konuşulanlar, itiraz veya talep..."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_190px]">
          <div>
            <Label htmlFor="lead-contact-next-action">Sonraki aksiyon</Label>
            <Input
              id="lead-contact-next-action"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              maxLength={1000}
              className="mt-1.5"
              aria-invalid={Boolean(formError && nextActionAt && !nextAction.trim())}
              aria-describedby={formError ? "lead-contact-error" : undefined}
              placeholder="Teknik föy gönder"
            />
          </div>
          <div>
            <Label htmlFor="lead-contact-next-at">Takip zamanı</Label>
            <Input
              id="lead-contact-next-at"
              type="datetime-local"
              value={nextActionAt}
              onChange={(event) => setNextActionAt(event.target.value)}
              className="mt-1.5"
              aria-describedby={formError ? "lead-contact-error" : undefined}
            />
          </div>
        </div>
        {formError && <p id="lead-contact-error" role="alert" className="text-sm text-red-700">{formError}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Vazgeç</Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Sonucu kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversionOverrideDialog({
  open,
  onOpenChange,
  blockers,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockers: string[];
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerekçeli dönüşüm</DialogTitle>
          <DialogDescription>
            Temel alanlar hazır; aşağıdaki nitelendirme eksikleri için karar gerekçesi geçmişe yazılacak.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
        </ul>
        <div>
          <Label htmlFor="lead-conversion-reason">Dönüşüm gerekçesi</Label>
          <Textarea
            id="lead-conversion-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            className="mt-1.5 min-h-24"
            placeholder="Neden bu eksiklere rağmen fırsata dönüştürülüyor?"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button
            type="button"
            disabled={saving || !reason.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm(reason.trim());
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Dönüştürülüyor…" : "Gerekçeyle dönüştür"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DecisionRail({
  salesCase,
  ownerName,
  users,
  canUpdate,
  canAssignOwner,
  onOwnerChanged,
  mobilePortalId,
  otherActions,
  contactPhone,
  contactEmail,
  whatsappNumber,
  primaryAction,
  useLeadConversionAsPrimary = false,
  showPlanAction = true,
  simpleMode = false,
  contactName,
  contactTitle,
  activityFeed,
}: {
  salesCase: SalesCase;
  ownerName?: string;
  users: User[];
  canUpdate: boolean;
  canAssignOwner: boolean;
  onOwnerChanged?: () => Promise<void> | void;
  mobilePortalId?: string;
  otherActions?: ReactNode;
  contactPhone?: string;
  contactEmail?: string;
  whatsappNumber?: string;
  primaryAction?: ReactNode;
  useLeadConversionAsPrimary?: boolean;
  /**
   * "Aksiyon planla" düğmesi burada basılsın mı? Üst bileşen karar özetinin
   * birincil komutunun aynı dialogu açıp açmadığını bilir; "Engelleri çöz"
   * dalında açmıyor, o zaman düğmenin tek kapısı ray olur.
   */
  showPlanAction?: boolean;
  simpleMode?: boolean;
  contactName?: string;
  contactTitle?: string;
  /**
   * Trello kart yorumları gibi çalışan aktivite akışı. Sekmeler kaldırıldıktan
   * sonra ayakta kalan tek kalıcı yüzey burası olduğu için akış "Sorumlu"
   * bloğunun altına, panelin kendisine gömüldü.
   */
  activityFeed?: ReactNode;
}) {
  const { convertCase, refresh, updateCase } = useStore();
  const isLead = salesCase.qualificationStage === "lead";
  const [contactOpen, setContactOpen] = useState(false);
  const [contactChannel, setContactChannel] = useState<LeadContactChannelCode>("phone");
  const [mailRecipient, setMailRecipient] = useState<MailRecipient | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideBlockers, setOverrideBlockers] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const [assigningOwner, setAssigningOwner] = useState(false);
  const [mobilePortalTarget, setMobilePortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMobilePortalTarget(mobilePortalId ? document.getElementById(mobilePortalId) : null);
  }, [mobilePortalId, salesCase.id]);
  const ownerCandidates = useMemo(
    () => users.filter((candidate) => (
      (candidate.active || candidate.id === salesCase.assignedUserId)
      && (
        !salesCase.divisionId
        || !candidate.divisionIds?.length
        || candidate.divisionIds.includes(salesCase.divisionId)
        || candidate.id === salesCase.assignedUserId
      )
    )),
    [salesCase.assignedUserId, salesCase.divisionId, users],
  );

  const contactUri = (channel: LeadContactChannelCode) => {
    if (channel === "email") return contactEmail ? `mailto:${contactEmail}` : null;
    const digits = (contactPhone || salesCase.leadPhone || salesCase.leadContactValue || "").replace(/\D/g, "");
    if (!digits) return null;
    return channel === "whatsapp" ? `https://wa.me/${whatsappNumber || digits}` : `tel:${digits}`;
  };

  const startContact = (channel: LeadContactChannelCode) => {
    if (channel === "email") {
      const address = contactEmail || salesCase.leadEmail;
      if (!address) {
        toast.message("E-posta bilgisi eksik");
        return;
      }
      setMailRecipient({
        email: address,
        name: contactName || salesCase.leadContactName,
        companyId: salesCase.customerId || undefined,
        contactId: salesCase.primaryContactId,
      });
      return;
    }
    setContactChannel(channel);
    if (isLead && canUpdate) setContactOpen(true);
    const uri = contactUri(channel);
    if (!uri) {
      toast.message(`${CHANNEL_LABELS[channel]} bilgisi eksik`);
      return;
    }
    if (channel === "whatsapp") window.open(uri, "_blank", "noopener,noreferrer");
    else window.location.href = uri;
  };

  const convert = async (overrideReason?: string) => {
    if (converting) return;
    setConverting(true);
    try {
      await convertCase(salesCase.id, "Eski ilk temas kaydı C alanına taşındı", overrideReason);
      await refresh();
      toast.success("Fırsat C alanına taşındı");
    } catch (error: any) {
      const details = error instanceof ApiError ? error.details as { requiresOverride?: boolean; blockers?: string[] } : null;
      if (details?.requiresOverride) {
        setOverrideBlockers(details.blockers ?? []);
        setOverrideOpen(true);
      } else {
        toast.error("Fırsat C alanına taşınamadı", {
          description: details?.blockers?.join(" · ") || error?.message || "Temel alanları kontrol edin.",
        });
      }
      if (overrideReason) throw error;
    } finally {
      setConverting(false);
    }
  };

  const assignOwner = async (value: string) => {
    const nextOwnerId = value === "__none__" ? "" : value;
    if (assigningOwner || nextOwnerId === (salesCase.assignedUserId ?? "")) return;
    setAssigningOwner(true);
    try {
      await updateCase(salesCase.id, { assignedUserId: nextOwnerId });
      await onOwnerChanged?.();
      const nextOwner = users.find((candidate) => candidate.id === nextOwnerId);
      toast.success(isLead ? "Lead sorumlusu değiştirildi" : "Fırsat sorumlusu değiştirildi", {
        description: nextOwner?.name ?? "Kayıt sahipsiz havuza taşındı.",
      });
    } catch (error: any) {
      toast.error("Sorumlu değiştirilemedi", {
        description: error?.message ?? "Kullanıcı yetkisini ve bölüm bağlantısını kontrol edin.",
      });
    } finally {
      setAssigningOwner(false);
    }
  };

  const ownerSelect = (compact = false) => (
    <Select
      value={salesCase.assignedUserId || "__none__"}
      disabled={!canAssignOwner || assigningOwner}
      onValueChange={(value) => void assignOwner(value)}
    >
      <SelectTrigger
        size="sm"
        className={compact
          ? "h-9 min-w-0 bg-white text-xs"
          : "mt-1 h-9 border-[#2457D6]/30 bg-blue-50/60 text-xs shadow-none focus:ring-blue-200"}
        aria-label={`${isLead ? "Lead" : "Fırsat"} sorumlusunu değiştir`}
      >
        <SelectValue placeholder="Sorumlu seçin" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Sahipsiz havuz</SelectItem>
        {ownerCandidates.map((candidate) => (
          <SelectItem key={candidate.id} value={candidate.id} disabled={!candidate.active}>
            {candidate.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const primaryCommand = useLeadConversionAsPrimary && canUpdate ? (
    <Button
      type="button"
      data-workspace-primary="convert"
      className="h-11 w-full justify-between bg-[#CF060C] hover:bg-[#a90409]"
      disabled={converting || salesCase.leadFollowUpStatus === "disqualified"}
      onClick={() => void convert()}
    >
      {converting ? "Dönüştürülüyor…" : "Fırsata dönüştür"}
      <ArrowRight className="size-4" />
    </Button>
  ) : (
    // NOT: aşağıdaki `primaryCommandIsSummaryCopy` bu ifadeye dayanıyor —
    // `primaryAction` verilmişse komut karar özetinin kopyasıdır. Yedek olarak
    // aksiyon dialogu basılmıyor: aynı düğme `showPlanAction` ile aşağıda,
    // tek bir yerden yönetiliyor.
    primaryAction ?? null
  );

  const primaryCommandIsSummaryCopy = !useLeadConversionAsPrimary && Boolean(primaryAction);

  // Hiçbir iletişim bilgisi yoksa üç düğme de tıklanıp "bilgi eksik" toast'ı
  // atıyordu: üç ölü düğme. O hâlde kullanıcının gerçekten yapabileceği tek iş
  // kalır — kişiyi eklemek.
  const hasAnyContactChannel = Boolean(contactPhone || contactEmail || whatsappNumber
    || salesCase.leadPhone || salesCase.leadEmail || salesCase.leadContactValue);

  const quickContactActions = (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{simpleMode ? "İletişim" : "Hızlı temas"}</div>
      {hasAnyContactChannel ? (
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
          <Button type="button" variant="outline" size="sm" className="h-11 gap-1 px-2 text-[11px]" onClick={() => startContact("phone")}><Phone className="size-4" /><span className={simpleMode ? "" : "sr-only"}>Ara</span></Button>
          <Button type="button" variant="outline" size="sm" className="h-11 gap-1 px-2 text-[11px]" onClick={() => startContact("email")}><Mail className="size-4" /><span className={simpleMode ? "" : "sr-only"}>E-posta</span></Button>
          <Button type="button" variant="outline" size="sm" className="h-11 gap-1 px-2 text-[11px]" onClick={() => startContact("whatsapp")}><MessageCircle className="size-4" /><span className={simpleMode ? "" : "sr-only"}>WhatsApp</span></Button>
        </div>
      ) : canUpdate && salesCase.customerId ? (
        <CreateContactDialog
          defaultCustomerId={salesCase.customerId}
          onCreated={() => void refresh()}
          trigger={
            <Button type="button" variant="outline" size="sm" className="h-11 w-full gap-1.5 text-xs">
              <UserPlus className="size-4" /> İlgili kişi ekle
            </Button>
          }
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">
          İletişim için önce {salesCase.customerId ? "ilgili kişi" : "firma"} bağlanmalı.
        </p>
      )}
      {isLead && canUpdate && hasAnyContactChannel && <Button type="button" variant="ghost" size="sm" className="mt-2 min-h-11 w-full text-xs sm:min-h-8" onClick={() => setContactOpen(true)}>Temas sonucunu kaydet</Button>}
    </div>
  );

  /*
    Ray ve mobil "İşlemler" sayfası AYNI içeriği kullanır. Ayrı yazıldıkları
    sürece kaçınılmaz biçimde ayrıştılar: "Tahmini kapanış" tarihi yalnız mobil
    sayfada vardı — masaüstünde alanın hiçbir düzenleyicisi yoktu ve Trello'dan
    gelen termin tarihi hiç görünmüyordu. "Ana kontak" ise yalnız pilot moda
    bağlıydı. Tek tanım, tek davranış; ekran genişliğine göre farklı yüzeyde
    render edilir.
  */
  const actionContents = (
    <div className="space-y-4">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <UserRound className="mt-0.5 size-4 text-[#2457D6]" />
        <div className="min-w-0 border-l-2 border-[#2457D6]/20 pl-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sorumlu</div>
            {assigningOwner && (
              <span className="inline-flex items-center gap-1 text-[9px] text-blue-700" aria-live="polite">
                <Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> Devrediliyor
              </span>
            )}
          </div>
          {canAssignOwner ? ownerSelect() : <div className="mt-0.5 truncate font-medium">{ownerName || "Sahipsiz havuz"}</div>}
          <div className="mt-1 truncate text-[9px] text-muted-foreground">
            {ownerCandidates.find((candidate) => candidate.id === salesCase.assignedUserId)?.department
              || (salesCase.assignedUserId ? "Satış ekibi" : "Atama bekliyor")}
          </div>
        </div>
      </div>
      {/* Kimin muhatap olduğu her modda gerekli; pilot bayrağına bağlı değil. */}
      {contactName && (
        <div className="border-t border-border pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ana kontak</div>
          <div className="mt-1 truncate text-sm font-semibold" title={contactName}>{contactName}</div>
          {contactTitle && <div className="mt-0.5 truncate text-xs text-muted-foreground" title={contactTitle}>{contactTitle}</div>}
        </div>
      )}
      {quickContactActions}
      {/*
        Tahmini kapanış tarihinin TEK düzenleyicisi burası: "Ticari alanları
        kaydet" formu kaldırılınca alanın tek yazarı Trello içe aktarımı kalmıştı.
      */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Tahmini kapanış
        </div>
        <Input
          type="date"
          className="h-9 text-xs"
          aria-label="Tahmini kapanış tarihi"
          value={salesCase.expectedCloseDate ?? ""}
          disabled={!canUpdate}
          onChange={(event) => {
            const next = event.target.value;
            void updateCase(salesCase.id, { expectedCloseDate: next || null });
          }}
        />
      </div>
      {/*
        Aksiyon planlama düğmesi yalnız başka hiçbir yüzey aynı dialogu
        basmıyorsa burada. Normal fırsatta karar özeti (masaüstü) / dock
        (mobil) onu zaten gösteriyor; lead'de birincil komut "Fırsata
        dönüştür", engelli fırsatta "Engelleri çöz", kapanmış kartta hiç
        komut yok — o üç durumda planlamanın tek kapısı burası.
      */}
      {canUpdate && !simpleMode && showPlanAction && (
        <NextActionDialog
          salesCase={salesCase}
          onSave={(patch) => updateCase(salesCase.id, patch)}
          trigger={<Button type="button" variant="outline" className="h-11 w-full gap-1.5"><AlarmClock className="size-4" /> {salesCase.nextAction ? "Aksiyonu düzenle" : "Aksiyon planla"}</Button>}
        />
      )}
      {/* Fırsatta ödeme vadesi, Trello kaynağı, kapanış/kayıp notu ve kartı
          kapat/kaybet/sil düğmeleri katlanır alana indi: hepsi günde bir kez
          bile açılmayan işler ve rayda açık dururken sık kullanılan aktivite
          akışını ekranın altına itiyorlardı. "Kaybedildi" ve "Fırsatı kapat"
          zaten satış alanı kutusunun altında da duruyor. Lead'de katlanmaz —
          orada blok, günlük olarak değişen "İlk temas durumu" seçimini
          taşıyor. */}
      {otherActions && (isLead ? (
        <div className="space-y-3 border-t border-slate-200 pt-4">{otherActions}</div>
      ) : (
        <details className="border-t border-slate-200 pt-3">
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-muted-foreground marker:content-none hover:text-foreground">
            Kart işlemleri
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </summary>
          <div className="mt-3">{otherActions}</div>
        </details>
      ))}
    </div>
  );

  const rail = (
    <aside className="space-y-3 lg:sticky lg:top-3" aria-label={simpleMode ? "Sorumlu ve iletişim" : "Çalışma alanı komutları"}>
      <div className={simpleMode ? "overflow-hidden rounded-xl border border-border bg-white" : "overflow-hidden rounded-xl border border-[#0b2453]/20 bg-white shadow-sm"}>
        <div className={simpleMode ? "flex items-center justify-between border-b border-border px-4 py-3" : "flex items-center justify-between bg-[#0b2453] px-4 py-3 text-white"}>
          <div>
            {!simpleMode && <div className="font-data text-[9px] font-semibold uppercase tracking-[0.18em] text-blue-100">Komutlar</div>}
            <div className="mt-0.5 font-display text-lg font-semibold">{simpleMode ? "Sorumlu ve iletişim" : "Kaydı ilerlet"}</div>
          </div>
          {!simpleMode && <span className="h-8 w-px bg-red-500" aria-hidden="true" />}
        </div>
        <div className="space-y-4 p-4">
          {actionContents}
          {/* Karar özeti bu düğmeyi masaüstünde zaten gösteriyor (`hidden lg:block`),
              mobilde ise gizleyip aşağıdaki dock'a bırakıyor. Ray da basınca
              masaüstünde aynı düğme ekranda iki kez çıkıyordu. Yalnız rayın
              KENDİ ürettiği komut (lead dönüştürme) burada kalır. */}
          {!simpleMode && primaryCommand && !primaryCommandIsSummaryCopy && <div className="border-t border-slate-200 pt-3">{primaryCommand}</div>}
          {/* Aktivite akışı: sekmeler kaldırıldıktan sonra ayakta kalan tek
              kalıcı yüzey burası. Sorumlu ve iletişim bloklarının altında
              duruyor ki panelin küçük ve sık kullanılan parçaları akışın
              uzunluğu yüzünden ekrandan taşmasın. */}
          {activityFeed && <div className="border-t border-slate-200 pt-3">{activityFeed}</div>}
        </div>
      </div>
    </aside>
  );

  const mobileDock = (
    <div data-testid="workspace-mobile-dock" className={`grid gap-2 lg:hidden ${primaryCommand ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1"}`}>
      <Sheet>
        <SheetTrigger asChild><Button type="button" variant="outline" className="h-11 gap-1.5"><SlidersHorizontal className="size-4" /> İşlemler</Button></SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader><SheetTitle>Çalışma alanı işlemleri</SheetTitle><SheetDescription>Sorumlu, temas, takip ve diğer kayıt işlemleri.</SheetDescription></SheetHeader>
          <div className="px-4 pb-4">{actionContents}</div>
        </SheetContent>
      </Sheet>
      {primaryCommand && <div data-opportunity-primary={simpleMode ? "true" : undefined}>{primaryCommand}</div>}
    </div>
  );

  return (
    <>
      <div className="hidden lg:block">{rail}</div>
      {mobilePortalTarget ? createPortal(mobileDock, mobilePortalTarget) : null}
      <ComposeMailDialog
        recipient={mailRecipient}
        onOpenChange={(open) => !open && setMailRecipient(null)}
        onSent={() => {
          if (isLead && canUpdate) {
            setContactChannel("email");
            setContactOpen(true);
          }
        }}
      />
      {isLead && (
        <>
          <ContactResultDialog
            open={contactOpen}
            onOpenChange={setContactOpen}
            salesCase={salesCase}
            initialChannel={contactChannel}
          />
          <ConversionOverrideDialog
            open={overrideOpen}
            onOpenChange={setOverrideOpen}
            blockers={overrideBlockers}
            onConfirm={async (reason) => {
              await convert(reason);
            }}
          />
        </>
      )}
    </>
  );
}

export function LeadQualificationPanel({ salesCase, canUpdate }: { salesCase: SalesCase; canUpdate: boolean }) {
  const { updateCase } = useStore();
  const [form, setForm] = useState({
    leadNeedSummary: salesCase.leadNeedSummary ?? "",
    leadAuthorityStatus: salesCase.leadAuthorityStatus ?? "unknown",
    leadBudgetStatus: salesCase.leadBudgetStatus ?? "unknown",
    leadPurchaseTimeframe: salesCase.leadPurchaseTimeframe ?? "unknown",
    leadTechnicalFit: salesCase.leadTechnicalFit ?? "unknown",
    leadTechnicalNote: salesCase.leadTechnicalNote ?? "",
  });
  const [saving, setSaving] = useState(false);
  // Yalnız başka bir karta geçilince forma sunucu değerlerini bas. Bağımlılık
  // `salesCase` nesnesiyken store'un her tazelemesi yeni referans üretiyor,
  // efekt de kullanıcının o sırada yazdığı metni siliyordu: girilen bilgi
  // kaydedilmeden kayboluyor, "kaydet" eski değeri gönderiyordu.
  useEffect(() => {
    setForm({
      leadNeedSummary: salesCase.leadNeedSummary ?? "",
      leadAuthorityStatus: salesCase.leadAuthorityStatus ?? "unknown",
      leadBudgetStatus: salesCase.leadBudgetStatus ?? "unknown",
      leadPurchaseTimeframe: salesCase.leadPurchaseTimeframe ?? "unknown",
      leadTechnicalFit: salesCase.leadTechnicalFit ?? "unknown",
      leadTechnicalNote: salesCase.leadTechnicalNote ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesCase.id]);
  const insights = salesCase.leadInsights;
  const completed = insights?.factors.filter((factor) => factor.complete).length ?? 0;
  const fields = useMemo(() => [
    {
      label: "Karar verici",
      key: "leadAuthorityStatus" as const,
      options: [["unknown", "Bilinmiyor"], ["influencer", "Etkileyici"], ["committee", "Komite"], ["decision_maker", "Karar verici"]],
    },
    {
      label: "Bütçe",
      key: "leadBudgetStatus" as const,
      options: [["unknown", "Bilinmiyor"], ["unavailable", "Bütçe yok"], ["estimated", "Tahmini"], ["approved", "Onaylı"]],
    },
    {
      label: "Satın alma zamanı",
      key: "leadPurchaseTimeframe" as const,
      options: [["unknown", "Bilinmiyor"], ["later", "12+ ay"], ["six_to_twelve_months", "6–12 ay"], ["three_to_six_months", "3–6 ay"], ["zero_to_three_months", "0–3 ay"], ["immediate", "Hemen"]],
    },
    {
      label: "Teknik uyum",
      key: "leadTechnicalFit" as const,
      options: [["unknown", "Bilinmiyor"], ["not_fit", "Uygun değil"], ["needs_review", "İnceleme gerekli"], ["fit", "Uygun"]],
    },
  ], []);

  const save = async () => {
    setSaving(true);
    try {
      await updateCase(salesCase.id, {
        leadNeedSummary: form.leadNeedSummary.trim() || null,
        leadAuthorityStatus: form.leadAuthorityStatus as SalesCase["leadAuthorityStatus"],
        leadBudgetStatus: form.leadBudgetStatus as SalesCase["leadBudgetStatus"],
        leadPurchaseTimeframe: form.leadPurchaseTimeframe as SalesCase["leadPurchaseTimeframe"],
        leadTechnicalFit: form.leadTechnicalFit as SalesCase["leadTechnicalFit"],
        leadTechnicalNote: form.leadTechnicalNote.trim() || null,
      });
      toast.success("Nitelendirme kaydedildi");
    } catch (error: any) {
      toast.error("Nitelendirme kaydedilemedi", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-[#0b2453]/15">
        <div className="h-1 bg-[linear-gradient(90deg,#0b2453_0%,#2457D6_72%,#CF060C_72%)]" />
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-lg">Dönüşüm hazırlığı</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Beşli kontrol yüzeyi ve eksikler anlık skorlanır.</p>
          </div>
          <div className="text-right">
            <div className="font-data text-2xl font-semibold text-[#0b2453]">{completed}/5</div>
            <div className="text-[10px] text-muted-foreground">tamamlandı</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="lead-need-summary">İhtiyaç özeti</Label>
            <Textarea id="lead-need-summary" maxLength={2000} disabled={!canUpdate} value={form.leadNeedSummary} onChange={(event) => setForm((current) => ({ ...current, leadNeedSummary: event.target.value }))} className="mt-1.5 min-h-24" placeholder="Makine, kapasite, proses ve beklenen iş sonucu..." />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key}>
                <Label>{field.label}</Label>
                <Select disabled={!canUpdate} value={form[field.key]} onValueChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}>
                  <SelectTrigger className="mt-1.5" aria-label={field.label}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {field.options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div>
            <Label htmlFor="lead-technical-note">Teknik not</Label>
            <Textarea id="lead-technical-note" maxLength={2000} disabled={!canUpdate} value={form.leadTechnicalNote} onChange={(event) => setForm((current) => ({ ...current, leadTechnicalNote: event.target.value }))} className="mt-1.5 min-h-20" />
          </div>
          {canUpdate && <Button type="button" onClick={() => void save()} disabled={saving} className="gap-1.5"><Save className="size-4" /> {saving ? "Kaydediliyor…" : "Nitelendirmeyi kaydet"}</Button>}
        </CardContent>
      </Card>
      {insights && (
        <Card>
          <CardHeader><CardTitle className="text-base">Puan açıklaması</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {insights.factors.map((factor) => (
              <div key={factor.key} className="grid grid-cols-[1fr_auto] gap-3 border-l-2 border-slate-200 pl-3">
                <div><div className="text-sm font-medium">{factor.label}</div><div className="text-xs text-muted-foreground">{factor.explanation}</div></div>
                <div className="font-data font-semibold">{factor.score}<span className="text-xs font-normal text-muted-foreground">/{factor.max}</span></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
