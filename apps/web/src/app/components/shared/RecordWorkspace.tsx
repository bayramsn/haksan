import { forwardRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, Download, Eye, FileText, ShieldCheck, UserRound } from "lucide-react";
import type { DocumentItem } from "../../lib/mock";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

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
  variant?: "default" | "compact";
  sectionLabel?: string;
}>(function WorkspaceDecisionSummary({ model, primaryAction, variant = "default", sectionLabel }, ref) {
  if (variant === "compact") {
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
        {model.risks.length > 0 && (
          <details className="mt-3 border-t border-border pt-3 text-xs">
            <summary className="min-h-11 cursor-pointer select-none py-3 font-medium text-amber-800">
              {model.risks.length} risk ayrıntısını göster
            </summary>
            <ul className="grid gap-2 sm:grid-cols-2">
              {model.risks.map((risk) => (
                <li key={risk.key} className={risk.tone === "danger" ? "rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive" : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"}>
                  <span className="font-semibold">{risk.label}</span>{risk.detail && <span className="block opacity-80">{risk.detail}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  }

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="workspace-decision-title"
      data-testid="workspace-decision-summary"
      className="scroll-mt-4 overflow-hidden rounded-xl border border-[#0b2453]/20 bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2457D6]"
    >
      <div className="h-1 bg-[linear-gradient(90deg,#0b2453_0%,#2457D6_70%,#CF060C_70%)]" />
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(220px,.8fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="workspace-decision-title" className="font-display text-xl font-semibold text-[#0b1739]">Sıradaki iş ve risk</h2>
              <p className="mt-1 text-xs text-muted-foreground">CRM verilerinden üretilen karar özeti; AI önerisi içermez.</p>
            </div>
            {model.terminalLabel && <Badge className="bg-slate-700">{model.terminalLabel}</Badge>}
          </div>
          <div className={`mt-4 rounded-r-lg border-l-[3px] px-3 py-3 ${model.nextActionOverdue ? "border-red-600 bg-red-50" : "border-[#2457D6] bg-blue-50"}`}>
            <div className="font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Sonraki aksiyon</div>
            <div className="mt-1 break-words text-sm font-semibold text-[#0b1739]">{model.nextAction}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className={`inline-flex items-center gap-1.5 ${model.nextActionOverdue ? "font-semibold text-red-700" : ""}`}><CalendarClock className="size-3.5" /> {model.nextActionDate}</span>
              <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" /> {model.ownerName}</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="min-w-0"><div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Mevcut</div><div className="mt-1 truncate text-sm font-semibold" title={model.currentStage}>{model.currentStage}</div></div>
            <ArrowRight className="size-4 text-[#2457D6]" aria-hidden="true" />
            <div className="min-w-0"><div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Sıradaki</div><div className="mt-1 truncate text-sm font-semibold" title={model.nextStage}>{model.nextStage}</div></div>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#0b1739]"><ShieldCheck className="size-4 text-[#2457D6]" /> Geçiş engelleri</span>
            <Badge variant="outline" className={model.blockerCount ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>{model.blockerCount}</Badge>
          </div>
        </div>

        <div className="min-w-0 lg:w-64">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Öncelikli riskler</div>
          {model.risks.length ? (
            <ul className="mt-2 space-y-2">
              {model.risks.map((risk) => (
                <li key={risk.key} className={`flex gap-2 rounded-lg border px-2.5 py-2 text-xs ${risk.tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span><span className="font-semibold">{risk.label}</span>{risk.detail && <span className="block opacity-80">{risk.detail}</span>}</span>
                </li>
              ))}
            </ul>
          ) : <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Kritik risk görünmüyor.</div>}
          {primaryAction && <div className="mt-3 [&_button]:min-h-11 [&_button]:w-full">{primaryAction}</div>}
        </div>
      </div>
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
