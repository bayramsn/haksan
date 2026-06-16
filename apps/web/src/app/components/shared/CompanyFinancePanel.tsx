import { useEffect, useState } from "react";
import { Wallet, CalendarClock, Download, Loader2, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { useAuth } from "../../../lib/auth";
import { financeService } from "../../../lib/services";
import { exportService } from "../../../lib/downloadExport";
import { toast } from "sonner";

export type FinanceSummaryData = {
  byCurrency: Array<{ currencyCode: string; borc: number; alacak: number; net: number }>;
  nearestDueDate: string | null;
  nearestDueAmount: number | null;
  nearestDueCurrency: string | null;
  nearestDueType: "borc" | "alacak" | null;
};

function fmt(n: number, cur: string) {
  const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "TRY" ? "₺" : "";
  return `${sym}${n.toLocaleString("tr-TR")} ${cur}`.trim();
}

export function CompanyFinancePanel({ companyId, companyName }: { companyId: string; companyName?: string }) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("super_admin");
  const [summary, setSummary] = useState<FinanceSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    financeService
      .companySummary(companyId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const downloadStatement = async () => {
    setExporting(true);
    try {
      await exportService.customerStatement(companyId, `${companyName ?? "firma"}-cari-ekstre.xlsx`);
      toast.success("Cari ekstre indirildi");
    } catch (e: any) {
      toast.error("Ekstre indirilemedi", { description: e?.message });
    } finally {
      setExporting(false);
    }
  };

  const downloadStatementPdf = async () => {
    setExportingPdf(true);
    try {
      await exportService.customerStatementPdf(companyId, `${companyName ?? "firma"}-cari-ekstre.pdf`);
      toast.success("Cari ekstre PDF indirildi");
    } catch (e: any) {
      toast.error("PDF indirilemedi", { description: e?.message });
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="size-4 animate-spin" /> Cari bakiye yükleniyor…
      </div>
    );
  }

  if (!summary?.byCurrency?.length) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><Wallet className="size-4" /> Cari bakiye kaydı yok</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={downloadStatement} disabled={exporting}>
            <Download className="size-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={downloadStatementPdf} disabled={exportingPdf}>
            <FileText className="size-3.5" /> PDF
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-gradient-to-r from-emerald-50/50 to-white px-3 py-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="size-4 text-emerald-600" /> Cari Durum
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={downloadStatement} disabled={exporting}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Excel
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={downloadStatementPdf} disabled={exportingPdf}>
            {exportingPdf ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
            PDF
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {summary.byCurrency.map((c) => (
          <div key={c.currencyCode} className="rounded-md border border-border/50 bg-white px-2.5 py-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Borç</span>
              <span className="tabular-nums font-medium text-amber-800">{fmt(c.borc, c.currencyCode)}</span>
            </div>
            {isAdmin && (
              <div className="flex justify-between gap-2 mt-1">
                <span className="text-muted-foreground">Alacak</span>
                <span className="tabular-nums font-medium text-sky-800">{fmt(c.alacak, c.currencyCode)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {summary.nearestDueDate && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border/40">
          <CalendarClock className="size-3.5 shrink-0" />
          En yakın vade:{" "}
          <span className="tabular-nums font-medium text-foreground">
            {new Date(summary.nearestDueDate).toLocaleDateString("tr-TR")}
            {summary.nearestDueAmount != null && summary.nearestDueCurrency
              ? ` · ${fmt(summary.nearestDueAmount, summary.nearestDueCurrency)}`
              : ""}
            {summary.nearestDueType === "alacak" ? " (ödenecek)" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
