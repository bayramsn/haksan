import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CalendarClock, ChevronRight, Download, Eye, FileText, ShieldCheck, UserRound } from "lucide-react";
import type { DocumentItem } from "../../lib/mock";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from "../ui/utils";

const DOCUMENT_TYPE_LABELS: Record<DocumentItem["type"], string> = {
  Proforma: "Proforma",
  Contract: "Sözleşme",
  CommercialInvoice: "Ticari fatura",
  AccountingInvoice: "Muhasebe faturası",
  DeliveryForm: "Teslim formu",
  InstallationForm: "Kurulum formu",
  ExternalQuote: "Dış teklif",
  Other: "Diğer",
};

export function RecordWorkspaceShell({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start">
      <div className="min-w-0">{children}</div>
      {rail}
    </div>
  );
}

/**
 * Katlanır bölümün başlangıç durumu.
 *
 * `shouldOpen` doğrudan `open`'a bağlanırsa bölüm kullanıcının ALTINDAN kapanır:
 * son görev tamamlandığında, son engel çözüldüğünde ya da son adım tiklendiğinde
 * — tam da sonucu görmek istediği anda. Bir kez açılan bölüm o kayıt boyunca
 * açık kalır; kapağı yalnız kullanıcı kapatır. Başka bir karta geçildiğinde
 * (`resetKey`) durum yeniden hesaplanır.
 */
export function useSectionOpen(shouldOpen: boolean, resetKey?: string): boolean {
  const [opened, setOpened] = useState(shouldOpen);
  useEffect(() => {
    setOpened(shouldOpen);
    // Kart değişiminde bilerek yalnız `resetKey` izleniyor: `shouldOpen`
    // eklenirse her kapanışta bölüm yeniden hesaplanıp geri kapanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  useEffect(() => {
    if (shouldOpen) setOpened(true);
  }, [shouldOpen]);
  return opened;
}

/**
 * Katlanır çalışma alanı bölümü.
 *
 * Kart detayı, hepsi aynı anda açık duran tam genişlik bloklarından oluşuyordu;
 * kullanıcı her açılışta ilgilenmediği dört beş kutuyu kaydırarak geçiyordu.
 * Her bölüm artık kendi kapağının altında ve KAPALIYKEN DE durumunu söylüyor
 * (`status`): "nerede kaldık" sorusu bölüm açılmadan yanıtlanır.
 *
 * `open` yalnız başlangıç değeridir. React aynı değeri yeniden dayatmadığı için
 * kullanıcının açıp kapaması korunur; değer gerçekten döndüğünde (ör. ilk açık
 * görev çıktığında) bölüm kendiliğinden açılır. Kapalı bölümdeki bir hedefe
 * giden derin bağlantılar `focusWorkspaceTarget` sayesinde kapağı açar.
 */
export function WorkspaceSection({
  id,
  title,
  status,
  actions,
  open = true,
  className,
  bodyClassName,
  children,
}: {
  id?: string;
  title: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  open?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={open}
      className={cn(
        "group/section overflow-hidden rounded-[var(--surface-radius)] border border-border/80 bg-card text-card-foreground shadow-xs",
        className,
      )}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:content-none hover:bg-muted/30 sm:px-5">
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/section:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">{title}</h3>
          {status && <div className="mt-0.5 truncate text-xs text-muted-foreground">{status}</div>}
        </div>
        {actions && (
          // Düğmeler `<summary>` içinde duruyor; tıklama kapağa sıçrayıp
          // bölümü açıp kapatmasın diye burada durduruluyor.
          <div
            className="flex shrink-0 flex-wrap items-center justify-end gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </summary>
      <div className={cn("border-t border-border/70", bodyClassName)}>{children}</div>
    </details>
  );
}

export type WorkspaceDecisionRisk = {
  key: string;
  label: string;
  detail?: string;
  tone?: "warning" | "danger";
};

export type WorkspaceDecisionModel = {
  nextAction: string;
  nextActionDate: string;
  nextActionOverdue: boolean;
  ownerName: string;
  currentStage: string;
  nextStage: string;
  blockerCount: number;
  readinessUnknown?: boolean;
  risks: WorkspaceDecisionRisk[];
  terminalLabel?: string;
};

export const WorkspaceDecisionSummary = forwardRef<HTMLElement, {
  model: WorkspaceDecisionModel;
  primaryAction?: ReactNode;
  sectionLabel?: string;
}>(function WorkspaceDecisionSummary({ model, primaryAction, sectionLabel }, ref) {
  /*
    Tek gösterim kaldı. Eski `default` varyantı aynı üç bilgiyi — sonraki iş,
    mevcut → sıradaki alan, riskler — iki katı yükseklikte, ayrı bir "Sıradaki
    iş ve risk" başlığı ve "CRM verilerinden üretilen karar özeti" açıklamasıyla
    veriyordu. Kart detayının en çok yer kaplayan kutusuydu ve altındaki satış
    alanı kutusunu ekranın dışına itiyordu. Bilginin tamamı duruyor; yalnız
    ikinci kopya ve dekoratif metin gitti.
  */
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="workspace-decision-title"
      data-testid="workspace-decision-summary"
      className="scroll-mt-4 rounded-xl border border-primary/20 bg-white p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,.9fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {sectionLabel ?? "Sonraki iş"}
          </div>
          <h2 id="workspace-decision-title" className="mt-1 truncate font-display text-lg font-semibold text-foreground" title={model.nextAction}>
            {model.nextAction}
          </h2>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className={model.nextActionOverdue ? "inline-flex items-center gap-1.5 font-semibold text-destructive" : "inline-flex items-center gap-1.5"}>
              <CalendarClock className="size-3.5" aria-hidden="true" /> {model.nextActionDate}
            </span>
            <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" aria-hidden="true" /> {model.ownerName}</span>
          </div>
        </div>

        <div className="min-w-0 border-y border-border py-3 lg:border-x lg:border-y-0 lg:px-5 lg:py-1">
          <div className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Süreç</div>
          <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
            <span className="truncate font-medium" title={model.currentStage}>{model.currentStage}</span>
            <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            <span className="truncate font-semibold text-primary" title={model.nextStage}>{model.nextStage}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            {model.readinessUnknown
              ? "Uygunluk doğrulanamadı"
              : model.blockerCount
                ? `${model.blockerCount} geçiş engeli`
                : "Geçiş engeli yok"}
            {model.terminalLabel && <Badge className="ml-auto bg-slate-700">{model.terminalLabel}</Badge>}
          </div>
        </div>

        {primaryAction && (
          <div data-opportunity-primary="true" className="hidden min-w-0 lg:block lg:min-w-56 [&_button]:min-h-11 [&_button]:w-full">
            {primaryAction}
          </div>
        )}
      </div>
      {/* Riskler doğrudan gösterilir. Tek bir riski açılır kapağın arkasına
          koymak, kullanıcıya okumadan önce bir tıklama maliyeti çıkarıyordu;
          zaten en fazla üç risk üretiliyor (buildWorkspaceDecisionModel). */}
      {model.risks.length > 0 && (
        <ul className="mt-3 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-2">
          {model.risks.map((risk) => (
            <li key={risk.key} className={risk.tone === "danger" ? "rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive" : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"}>
              <span className="font-semibold">{risk.label}</span>{risk.detail && <span className="block opacity-90">{risk.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

export function HealthStrip({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string; tone?: "neutral" | "good" | "risk" }>;
}) {
  return (
    <Card className="overflow-hidden border-[#0b2453]/15">
      <div className="h-1 bg-[linear-gradient(90deg,#0b2453_0%,#2457D6_72%,#CF060C_72%)]" />
      <CardContent className={`grid gap-3 p-4 ${items.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {items.map((item) => (
          <div
            key={item.label}
            className={`border-l-2 pl-3 ${
              item.tone === "risk" ? "border-red-600" : item.tone === "good" ? "border-emerald-600" : "border-slate-300"
            }`}
          >
            <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{item.label}</div>
            <div className={`mt-1 truncate font-data text-base font-semibold tabular-nums ${
              item.tone === "risk" ? "text-red-700" : item.tone === "good" ? "text-emerald-700" : "text-[#0b1739]"
            }`}>{item.value}</div>
            {item.hint && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.hint}</div>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export type UnifiedTimelineItem = {
  id: string;
  date: string;
  category: string;
  categoryLabel: string;
  title: string;
  detail?: string;
  actor?: string;
  sourceActivityId?: string;
};

export function UnifiedTimeline({
  items,
  focusedId,
  formatDate,
  emptyLabel = "Zaman çizelgesi kaydı yok.",
  renderActions,
}: {
  items: UnifiedTimelineItem[];
  focusedId?: string | null;
  formatDate: (value: string, withTime?: boolean) => string;
  emptyLabel?: string;
  renderActions?: (item: UnifiedTimelineItem) => ReactNode;
}) {
  if (!items.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
  }
  return (
    <ol className="relative ml-2 space-y-4 border-l border-slate-200">
      {items.map((item) => {
        const focused = item.id === focusedId;
        return (
          <li
            id={item.id}
            key={item.id}
            tabIndex={focused ? -1 : undefined}
            className={`relative ml-5 scroll-mt-24 rounded-lg outline-none transition ${
              focused ? "bg-amber-50 px-3 py-2 ring-2 ring-amber-300 motion-reduce:transition-none" : ""
            }`}
          >
            <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-[#0b2453] ring-4 ring-white" />
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <Badge variant="outline" className="px-1.5 py-0 text-[9px]">{item.categoryLabel}</Badge>
              <span>{formatDate(item.date, true)}</span>
              {item.actor && <span>· {item.actor}</span>}
              {focused && <Badge className="bg-amber-600 px-1.5 py-0 text-[9px]">Bahsetme</Badge>}
            </div>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm font-medium">{item.title}</div>
              {renderActions && <div className="shrink-0">{renderActions(item)}</div>}
            </div>
            {item.detail && <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{item.detail}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export function DocumentPanel({
  documents,
  uploadAction,
  onDownload,
  onPreview,
}: {
  documents: DocumentItem[];
  uploadAction?: ReactNode;
  onDownload: (document: DocumentItem) => void;
  onPreview: (document: DocumentItem) => void;
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const visible = documents.filter((document) => typeFilter === "all" || document.type === typeFilter);
  const documentVersion = (document: DocumentItem) =>
    Number(document.fileName.match(/(?:^|[-_ .])(?:r|rev|v)(\d+)(?:[-_ .]|$)/i)?.[1] ?? 0);
  const documentFamily = (document: DocumentItem) =>
    document.fileName
      .replace(/(?:^|[-_ .])(?:r|rev|v)\d+(?=[-_ .]|$)/i, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("tr-TR");
  const grouped = [...visible.reduce((families, document) => {
    const family = documentFamily(document);
    const current = families.get(family) ?? [];
    current.push(document);
    families.set(family, current);
    return families;
  }, new Map<string, DocumentItem[]>()).entries()]
    .map(([family, familyDocuments]) => ({
      family,
      documents: familyDocuments.sort((left, right) =>
        documentVersion(right) - documentVersion(left) ||
        new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime()
      ),
    }))
    .sort((left, right) => left.family.localeCompare(right.family, "tr-TR"));
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="inline-flex items-center gap-2 text-base"><FileText className="size-4" /> Dosyalar</CardTitle>
          {uploadAction}
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-11 w-full bg-white text-xs sm:h-8 sm:w-48" aria-label="Dosya türü filtresi"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm dosya türleri</SelectItem>
            {[...new Set(documents.map((document) => document.type))].map((type) => (
              <SelectItem key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-2">
        {grouped.map((group) => (
          <section key={group.family} className="space-y-1.5" aria-label={group.documents[0]?.fileName}>
            {group.documents.length > 1 && (
              <div className="flex items-center justify-between px-1 pt-1 text-[10px] text-muted-foreground">
                <span className="truncate font-medium">{group.documents[0].fileName.replace(/(?:^|[-_ .])(?:r|rev|v)\d+(?=[-_ .]|$)/i, " ")}</span>
                <span className="shrink-0">{group.documents.length} sürüm</span>
              </div>
            )}
            {group.documents.map((document) => {
              const version = documentVersion(document);
              const previewable = document.mimeType === "application/pdf" || document.mimeType?.startsWith("image/");
              return (
                <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{document.fileName}</div>
                      {version > 0 && <Badge variant="outline" className="h-5 text-[9px]">Sürüm {version}</Badge>}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {DOCUMENT_TYPE_LABELS[document.type]} · {new Date(document.uploadedAt).toLocaleDateString("tr-TR")} · {document.size}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 sm:gap-1">
                    {previewable && (
                      <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-8" disabled={!document.fileId} onClick={() => onPreview(document)}>
                        <Eye className="size-4" /><span className="sr-only">{document.fileName} önizle</span>
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-8" disabled={!document.fileId} onClick={() => onDownload(document)}>
                      <Download className="size-4" /><span className="sr-only">{document.fileName} indir</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        {!visible.length && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">Bu filtrede dosya yok.</div>}
      </CardContent>
    </Card>
  );
}
