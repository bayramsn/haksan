import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, Loader2, MoreHorizontal, PhoneCall, PhoneMissed, Plus, RefreshCw, Sparkles, X,
} from "lucide-react";
import { callAssistantService, type CallSuggestionDTO } from "../../../lib/services";
import type { OperationAction } from "../../lib/operations";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { EmptyState } from "../shared/EmptyState";
import { InsightStat } from "../shared/PremiumPrimitives";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";

type SuggestionStatus = "pending" | "acted" | "dismissed";
type SuggestionAction = "create_quote" | "create_service_ticket" | "log_call" | "dismiss";

const STATUS_TABS: Array<{ id: SuggestionStatus; label: string }> = [
  { id: "pending", label: "Bekleyen" },
  { id: "acted", label: "İşlenen" },
  { id: "dismissed", label: "Yoksayılan" },
];

const ACTION_LABELS: Record<Exclude<SuggestionAction, "dismiss">, { title: string; noteLabel: string; success: string }> = {
  create_quote: { title: "Teklif Oluştur", noteLabel: "Teklif notu (opsiyonel)", success: "Teklif taslağı oluşturuldu" },
  create_service_ticket: { title: "Servis Kaydı Aç", noteLabel: "Şikayet açıklaması (opsiyonel)", success: "Şikayet Kutusu'na aktarıldı" },
  log_call: { title: "Görüşme Notu", noteLabel: "Görüşme notu (opsiyonel)", success: "Arama kaydı oluşturuldu" },
};

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function callDuration(suggestion: CallSuggestionDTO) {
  if (suggestion.event.eventType === "missed") return "Yanıtsız";
  const started = suggestion.event.startedAt ? new Date(suggestion.event.startedAt).getTime() : NaN;
  const ended = suggestion.event.endedAt ? new Date(suggestion.event.endedAt).getTime() : NaN;
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return "Süre yok";
  const seconds = Math.max(0, Math.round((ended - started) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} dk ${seconds % 60} sn` : `${seconds} sn`;
}

function intentMeta(suggestion: CallSuggestionDTO) {
  if (suggestion.availableActions.createServiceTicket) return { label: "Servis ihtiyacı", tone: "border-warning/30 bg-warning/5 text-warning" };
  if (suggestion.availableActions.createQuote) return { label: "Satış fırsatı", tone: "border-info/30 bg-info/5 text-info" };
  return { label: "Görüşme takibi", tone: "border-border/70 bg-muted/35 text-muted-foreground" };
}

function suggestionActions(suggestion: CallSuggestionDTO): Array<{ action: Exclude<SuggestionAction, "dismiss">; label: string }> {
  const actions: Array<{ action: Exclude<SuggestionAction, "dismiss">; label: string }> = [];
  if (suggestion.availableActions.createServiceTicket) actions.push({ action: "create_service_ticket", label: "Servis Kaydı Aç" });
  if (suggestion.availableActions.createQuote) actions.push({ action: "create_quote", label: "Teklif Oluştur" });
  if (suggestion.availableActions.logCall) actions.push({ action: "log_call", label: "Görüşme Notu" });
  return actions;
}

export function CallAssistantPage({ onAction }: { onAction?: (action: OperationAction) => void }) {
  const [status, setStatus] = useState<SuggestionStatus>("pending");
  const [suggestions, setSuggestions] = useState<CallSuggestionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<{ suggestion: CallSuggestionDTO; action: Exclude<SuggestionAction, "dismiss"> } | null>(null);

  const refresh = useCallback(async (nextStatus: SuggestionStatus = status) => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAssistantService.suggestions({ status: nextStatus });
      setSuggestions(res.data ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Çağrı önerileri alınamadı");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refresh(status);
  }, [status, refresh]);

  const dismiss = async (suggestion: CallSuggestionDTO) => {
    try {
      await callAssistantService.action(suggestion.id, "dismiss");
      setSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
      toast.message("Arama önerisi kapatıldı");
    } catch (err: any) {
      toast.error("Arama önerisi işlenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  const runAction = async (suggestion: CallSuggestionDTO, action: Exclude<SuggestionAction, "dismiss">, note: string) => {
    const trimmed = note.trim();
    const body =
      action === "create_quote"
        ? { notes: trimmed || undefined }
        : action === "create_service_ticket"
          ? { description: trimmed || undefined }
          : { notes: trimmed || undefined };
    try {
      await callAssistantService.action(suggestion.id, action, body);
      setSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
      const companyName = suggestion.company.shortName || suggestion.company.legalTitle;
      toast.success(ACTION_LABELS[action].success, { description: companyName });
      if (action === "create_quote") onAction?.({ kind: "navigate", nav: "offers", query: companyName });
      if (action === "create_service_ticket") onAction?.({ kind: "navigate", nav: "service-requests", query: "complaints" });
    } catch (err: any) {
      toast.error("Arama önerisi işlenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <div className="space-y-4">
      <section className="premium-blueprint precision-corners overflow-hidden rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-primary">ÇAĞRI İÇGÖRÜ AKIŞI</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Sıradaki görüşme aksiyonu</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Firma eşleşmesi, çağrı yönü, niyet ve tek önerilen eylemi aynı kartta değerlendirin.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[460px]">
            <InsightStat label={STATUS_TABS.find((tab) => tab.id === status)?.label || "Kayıt"} value={suggestions.length} icon={<PhoneCall />} />
            <InsightStat label="Cevapsız" value={suggestions.filter((item) => item.event.eventType === "missed").length} icon={<PhoneMissed />} tone={suggestions.some((item) => item.event.eventType === "missed") ? "warning" : "success"} />
            <InsightStat label="Servis Niyeti" value={suggestions.filter((item) => item.availableActions.createServiceTicket).length} icon={<AlertTriangle />} tone="warning" />
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(v) => setStatus(v as SuggestionStatus)}>
          <TabsList className="h-9 bg-muted/60">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-xs">
                {tab.label}
                {status === tab.id && !loading && (
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-muted text-muted-foreground">
                    {suggestions.length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" />
            Yenile
          </Button>
          <ManualCallDialog onCreated={() => void refresh("pending")} />
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center rounded-lg border border-dashed border-border/70 bg-white py-16 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Çağrı önerileri yükleniyor
          </span>
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-white p-6 text-sm">
          <div className="font-medium">Öneriler alınamadı</div>
          <div className="text-muted-foreground">{error}</div>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            Tekrar Dene
          </Button>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-white">
          <EmptyState
            scene="calls"
            title={
              status === "pending"
                ? "Bekleyen çağrı önerisi yok"
                : status === "acted"
                  ? "İşlenmiş çağrı önerisi yok"
                  : "Yoksayılan çağrı önerisi yok"
            }
            description={status === "pending" ? "Manuel arama ekleyerek yeni öneri oluşturabilirsiniz." : undefined}
            action={status === "pending" ? <ManualCallDialog onCreated={() => void refresh("pending")} /> : undefined}
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              showActions={status === "pending"}
              onDismiss={() => void dismiss(suggestion)}
              onRunAction={(action) => setActionTarget({ suggestion, action })}
            />
          ))}
        </div>
      )}

      {actionTarget && (
        <ActionDialog
          target={actionTarget}
          onClose={() => setActionTarget(null)}
          onSubmit={async (note) => {
            const { suggestion, action } = actionTarget;
            setActionTarget(null);
            await runAction(suggestion, action, note);
          }}
        />
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  showActions,
  onDismiss,
  onRunAction,
}: {
  suggestion: CallSuggestionDTO;
  showActions: boolean;
  onDismiss: () => void;
  onRunAction: (action: Exclude<SuggestionAction, "dismiss">) => void;
}) {
  const companyName = suggestion.company.shortName || suggestion.company.legalTitle;
  const missed = suggestion.event.eventType === "missed";
  const inbound = suggestion.event.direction === "inbound";
  const intent = intentMeta(suggestion);
  const actions = suggestionActions(suggestion);
  const primaryAction = actions[0];
  const secondaryActions = actions.slice(1);
  return (
    <Card className="group relative overflow-hidden border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${missed ? "bg-brand-red" : "bg-success"}`} />
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div
            className={`size-9 rounded-lg grid place-items-center shrink-0 shadow-xs ring-1 ring-border/50 ${
              missed ? "bg-brand-red-soft text-brand-red" : "bg-success-soft text-success"
            }`}
          >
            {missed ? <PhoneMissed className="size-4" /> : <PhoneCall className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="truncate text-sm font-medium">{companyName}</div>
              <Badge
                variant="outline"
                className={`h-5 px-1.5 text-[10px] ${missed ? "border-brand-red/20 bg-brand-red-soft text-brand-red" : "border-success/20 bg-success-soft text-success"}`}
              >
                {missed ? "Kaçan arama" : "Arama bitti"}
              </Badge>
              <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground">
                {inbound ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                {inbound ? "Gelen" : "Giden"}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {suggestion.contact?.fullName ? `${suggestion.contact.fullName} · ` : ""}
              {suggestion.event.normalizedPhone ?? "Numara yok"}
              {" · "}
              {formatDateTime(suggestion.createdAt)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={`h-5 gap-1 px-1.5 text-[10px] ${intent.tone}`}><Sparkles className="size-3" /> {intent.label}</Badge>
              <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"><Clock3 className="size-3" /> {callDuration(suggestion)}</Badge>
              {missed && <Badge variant="outline" className="h-5 border-destructive/25 bg-destructive/5 px-1.5 text-[10px] text-destructive">Yüksek öncelik</Badge>}
            </div>
          </div>
        </div>
        <div className="text-sm leading-relaxed">{suggestion.title}</div>
        {suggestion.body && <div className="text-xs leading-relaxed text-muted-foreground">{suggestion.body}</div>}
        {showActions && (
          <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Önerilen sonraki adım</span>
            <div className="flex items-center gap-1.5">
              {primaryAction && <Button type="button" size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={() => onRunAction(primaryAction.action)}><CheckCircle2 className="size-3.5" /> {primaryAction.label}</Button>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="outline" className="size-8" aria-label="Diğer çağrı işlemleri"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {secondaryActions.map((item) => <DropdownMenuItem key={item.action} onClick={() => onRunAction(item.action)}>{item.label}</DropdownMenuItem>)}
                  <DropdownMenuItem className="text-muted-foreground" onClick={onDismiss}><X className="size-3.5" /> Yoksay</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: { suggestion: CallSuggestionDTO; action: Exclude<SuggestionAction, "dismiss"> };
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const labels = ACTION_LABELS[target.action];
  const companyName = target.suggestion.company.shortName || target.suggestion.company.legalTitle;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(440px,calc(100vw-2rem))]">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitting(true);
            onSubmit(note);
          }}
        >
          <DialogHeader>
            <DialogTitle>{labels.title}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">{companyName}</div>
          <Textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={labels.noteLabel}
            maxLength={2000}
            rows={4}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={submitting}>
              {labels.title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManualCallDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [eventType, setEventType] = useState<"completed" | "missed">("completed");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const phone = phoneNumber.trim();
    if (!phone) {
      toast.error("Telefon numarası gerekli.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await callAssistantService.manualEvent({ phoneNumber: phone, direction, eventType });
      if (res.suggestions.length > 0) {
        toast.success("Arama önerisi oluşturuldu");
        setPhoneNumber("");
        setOpen(false);
        onCreated();
      } else if (res.event.matchStatus === "ambiguous") {
        toast.warning("Numara birden fazla firmayla eşleşti.");
      } else {
        toast.warning("Numara kayıtlı firmayla eşleşmedi.");
      }
    } catch (err: any) {
      toast.error("Manuel arama kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Manuel Arama
      </Button>
      <DialogContent className="w-[min(420px,calc(100vw-2rem))]">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Manuel arama kaydı</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            inputMode="tel"
            aria-label="Telefon numarası"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="0532 111 22 33"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={direction === "inbound" ? "default" : "outline"} onClick={() => setDirection("inbound")}>
              Gelen
            </Button>
            <Button type="button" variant={direction === "outbound" ? "default" : "outline"} onClick={() => setDirection("outbound")}>
              Giden
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={eventType === "completed" ? "default" : "outline"} onClick={() => setEventType("completed")}>
              Arama bitti
            </Button>
            <Button type="button" variant={eventType === "missed" ? "default" : "outline"} onClick={() => setEventType("missed")}>
              Kaçan arama
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={submitting}>
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
