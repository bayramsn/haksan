import { useState, type ReactNode } from "react";
import { Download, Eye, FileText } from "lucide-react";
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
};

export function UnifiedTimeline({
  items,
  focusedId,
  formatDate,
  emptyLabel = "Zaman çizelgesi kaydı yok.",
}: {
  items: UnifiedTimelineItem[];
  focusedId?: string | null;
  formatDate: (value: string, withTime?: boolean) => string;
  emptyLabel?: string;
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
            <div className="mt-1 text-sm font-medium">{item.title}</div>
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
