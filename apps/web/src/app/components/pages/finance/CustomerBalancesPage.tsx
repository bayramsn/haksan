import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { MiniKpi } from "../../shared/MiniKpi";
import { EmptyState } from "../../shared/EmptyState";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { financeService } from "../../../../lib/services";
import { exportService } from "../../../../lib/downloadExport";
import { Wallet, Search, Download, FileText, Building2, CalendarClock, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";

type BalanceRow = {
  companyId: string;
  companyName: string;
  salesTotal: number;
  collections: number;
  borc: number;
  purchases: number | null;
  payouts: number | null;
  alacak: number | null;
  netBorc: number;
  totalBalance?: number;
  primaryCurrency: string | null;
  nearestDueDate: string | null;
  nearestDueAmount: number | null;
  nearestDueCurrency: string | null;
  currencies: Array<{
    currencyCode: string;
    salesTotal: number;
    collections: number;
    purchases: number;
    payouts: number;
    borc: number;
    alacak: number;
    net: number;
    totalBalance: number;
  }>;
};

type StatementBalance = {
  currencyCode: string;
  debit: number;
  credit: number;
  balance: number;
};

const formatMoney = (amount: number, currencyCode?: string | null) =>
  `${Number(amount ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currencyCode ? ` ${currencyCode}` : ""}`;

const balanceTone = (amount: number) => amount >= 0 ? "text-warning" : "text-info";

const openDebtForRow = (row: BalanceRow) =>
  (row.currencies ?? []).reduce((sum, item) => sum + Math.max(0, Number(item.borc ?? 0)), 0) || Number(row.borc ?? 0);

function agingState(row: BalanceRow) {
  if (!row.nearestDueDate || openDebtForRow(row) <= 0) return { index: 0, label: "Güncel", tone: "success" as const };
  const due = new Date(row.nearestDueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  if (days <= 0) return { index: 0, label: days === 0 ? "Bugün vadeli" : `${Math.abs(days)} gün var`, tone: days === 0 ? "warning" as const : "success" as const };
  if (days <= 30) return { index: 1, label: `${days} gün gecikmiş`, tone: "warning" as const };
  if (days <= 60) return { index: 2, label: `${days} gün gecikmiş`, tone: "danger" as const };
  return { index: 3, label: `${days}+ gün gecikmiş`, tone: "danger" as const };
}

function AgingHeatmap({ row }: { row: BalanceRow }) {
  const state = agingState(row);
  const activeClass = state.tone === "danger" ? "bg-destructive" : state.tone === "warning" ? "bg-warning" : "bg-success";
  return (
    <div className="min-w-[116px]" aria-label={`Yaşlandırma durumu: ${state.label}`}>
      <div className="mb-1 flex gap-1" aria-hidden="true">
        {["Güncel", "1–30", "31–60", "60+"].map((label, index) => (
          <span key={label} className={`h-1.5 flex-1 rounded-full ${index === state.index ? activeClass : "bg-muted"}`} />
        ))}
      </div>
      <div className={`text-[10px] font-medium ${state.tone === "danger" ? "text-destructive" : state.tone === "warning" ? "text-warning" : "text-success"}`}>{state.label}</div>
    </div>
  );
}

function CurrencyMoneyList({
  row,
  field,
  className = "",
}: {
  row: BalanceRow;
  field: "salesTotal" | "collections" | "borc" | "net";
  className?: string;
}) {
  const all = row.currencies ?? [];
  const visible = all.filter((item) => Math.abs(Number(item[field] ?? 0)) > 0.0001);
  const items = visible.length ? visible : all.slice(0, 1);
  if (!items.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className={`space-y-0.5 text-right tabular-nums ${className}`}>
      {items.map((item) => (
        <div key={item.currencyCode} className="whitespace-nowrap">
          {formatMoney(Number(item[field] ?? 0), item.currencyCode)}
        </div>
      ))}
    </div>
  );
}

export function CustomerBalancesPage() {
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [statementCompany, setStatementCompany] = useState<BalanceRow | null>(null);
  const [statementLines, setStatementLines] = useState<any[]>([]);

  const load = () => {
    setLoading(true);
    financeService
      .customerBalances()
      .then((data) => setRows(data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => r.companyName.toLowerCase().includes(q.toLowerCase()));
  const statementBalances = useMemo<StatementBalance[]>(() => {
    if (statementLines.length > 0) {
      const map = new Map<string, StatementBalance>();
      for (const line of statementLines) {
        const currencyCode = String(line.currencyCode ?? statementCompany?.primaryCurrency ?? "USD");
        const current = map.get(currencyCode) ?? { currencyCode, debit: 0, credit: 0, balance: 0 };
        current.debit += Number(line.debit ?? 0);
        current.credit += Number(line.credit ?? 0);
        current.balance = Number(line.balance ?? current.balance);
        map.set(currencyCode, current);
      }
      return [...map.values()];
    }
    return (statementCompany?.currencies ?? []).map((item) => ({
      currencyCode: item.currencyCode,
      debit: item.borc,
      credit: item.alacak,
      balance: item.net,
    }));
  }, [statementLines, statementCompany]);

  const openStatement = async (row: BalanceRow) => {
    setStatementCompany(row);
    try {
      const lines = await financeService.companyStatement(row.companyId, {});
      setStatementLines(lines ?? []);
    } catch {
      setStatementLines([]);
      toast.error("Ekstre yüklenemedi");
    }
  };

  const debtTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of filtered) {
      for (const item of row.currencies ?? []) {
        totals.set(item.currencyCode, (totals.get(item.currencyCode) ?? 0) + Number(item.borc ?? 0));
      }
    }
    return [...totals.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }, [filtered]);
  const currencyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of filtered) {
      for (const item of row.currencies ?? []) totals.set(item.currencyCode, (totals.get(item.currencyCode) ?? 0) + item.net);
    }
    return [...totals.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }, [filtered]);
  const overdueCount = filtered.filter((row) => agingState(row).index > 0).length;
  const dueSoonCount = filtered.filter((row) => {
    if (!row.nearestDueDate) return false;
    const days = Math.ceil((new Date(row.nearestDueDate).getTime() - Date.now()) / 86_400_000);
    return days >= 0 && days <= 7;
  }).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<Building2 className="size-[18px]" />} label="Kayıtlı Firma" value={filtered.length} sub="açık cari" />
        <MiniKpi
          tone="amber"
          icon={<Wallet className="size-[18px]" />}
          label="Açık Borç"
          value={debtTotals[0] ? formatMoney(debtTotals[0][1], debtTotals[0][0]) : "0"}
          sub={debtTotals.length > 1 ? `+${debtTotals.length - 1} para birimi` : "tahsilat sonrası"}
        />
        <MiniKpi tone="red" icon={<CalendarClock className="size-[18px]" />} label="Gecikmiş" value={overdueCount} sub="aksiyon gerekli" />
        <MiniKpi tone="blue" icon={<CircleDollarSign className="size-[18px]" />} label="7 Gün İçinde" value={dueSoonCount} sub="yaklaşan vade" />
      </div>

      {currencyTotals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/10 bg-brand-blue-soft/50 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Net bakiye · para birimi bazında</span>
          {currencyTotals.map(([code, amount]) => (
            <Badge key={code} variant="outline" className={`bg-white font-data tabular-nums ${balanceTone(amount)}`}>{formatMoney(amount, code)}</Badge>
          ))}
        </div>
      )}

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="tracking-tight">Cari Rapor</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Firma ara..." className="pl-9 h-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ExportExcelButton path="/exports/customer-balances" filename="cari-rapor.xlsx" className="h-9" />
            <Button size="sm" variant="outline" className="h-9" onClick={load}>Yenile</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
                <TableHead className="sticky left-0 z-20 min-w-52 bg-muted">Firma / Para Birimi</TableHead>
                <TableHead className="text-right">Satış</TableHead>
                <TableHead className="text-right">Tahsilat</TableHead>
                <TableHead className="text-right">Açık Borç</TableHead>
                <TableHead className="text-right">Net Bakiye</TableHead>
                <TableHead>Yaşlandırma</TableHead>
                <TableHead>En Yakın Vade</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Yükleniyor…</TableCell></TableRow>
              )}
              {!loading && filtered.map((r) => (
                <TableRow
                  key={r.companyId}
                  className={`cursor-pointer ${openDebtForRow(r) > 0 ? "bg-warning-soft/40 hover:bg-warning-soft/60" : "hover:bg-primary/[0.025]"}`}
                  onClick={() => openStatement(r)}
                >
                  <TableCell className={`sticky left-0 z-10 min-w-52 border-r border-border/60 ${openDebtForRow(r) > 0 ? "bg-[#fffaf0]" : "bg-white"}`}>
                    <div className="font-medium">{r.companyName}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(r.currencies ?? []).slice(0, 3).map((item) => (
                        <span key={item.currencyCode} className="rounded border border-border/60 bg-white px-1.5 py-0.5 font-data text-[9px] text-muted-foreground">
                          {item.currencyCode} {Number(item.net).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell><CurrencyMoneyList row={r} field="salesTotal" className="text-muted-foreground" /></TableCell>
                  <TableCell><CurrencyMoneyList row={r} field="collections" className="text-muted-foreground" /></TableCell>
                  <TableCell><CurrencyMoneyList row={r} field="borc" className="font-medium text-warning" /></TableCell>
                  <TableCell><CurrencyMoneyList row={r} field="net" className="font-medium text-foreground" /></TableCell>
                  <TableCell><AgingHeatmap row={r} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.nearestDueDate ? (
                      <>
                        {new Date(r.nearestDueDate).toLocaleDateString("tr-TR")}
                        {r.nearestDueAmount != null && ` · ${r.nearestDueAmount.toLocaleString("tr-TR")} ${r.nearestDueCurrency ?? ""}`}
                      </>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1"
                        title="Excel ekstre"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportService.customerStatement(r.companyId, `${r.companyName}-ekstre.xlsx`).catch((err) => toast.error(err.message));
                        }}
                      >
                        <Download className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1"
                        title="PDF ekstre"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportService.customerStatementPdf(r.companyId, `${r.companyName}-ekstre.pdf`).catch((err) => toast.error(err.message));
                        }}
                      >
                        <FileText className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-4">
                    <EmptyState
                      scene="search"
                      title="Kayıt bulunamadı"
                      description="Arama terimini değiştirerek tekrar deneyin."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!statementCompany} onOpenChange={(o) => !o && setStatementCompany(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>Cari Ekstre — {statementCompany?.companyName}</span>
              {statementCompany && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() =>
                      exportService
                        .customerStatement(statementCompany.companyId, `${statementCompany.companyName}-ekstre.xlsx`)
                        .catch((err) => toast.error(err.message))
                    }
                  >
                    <Download className="size-3.5" /> Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() =>
                      exportService
                        .customerStatementPdf(statementCompany.companyId, `${statementCompany.companyName}-ekstre.pdf`)
                        .catch((err) => toast.error(err.message))
                    }
                  >
                    <FileText className="size-3.5" /> PDF
                  </Button>
                </div>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Seçili firmanın borç, alacak ve bakiye hareketleri
            </DialogDescription>
          </DialogHeader>
          {statementBalances.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Yaşlandırma</div>
                {statementCompany && <div className="mt-2"><AgingHeatmap row={statementCompany} /></div>}
                <div className="mt-1 text-[10px] text-muted-foreground">En yakın açık vadeye göre</div>
              </div>
              {statementBalances.map((item) => (
                <div key={item.currencyCode} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.currencyCode} Cari Hesap</div>
                  <div className={`mt-1 text-lg font-semibold tabular-nums ${balanceTone(item.balance)}`}>
                    {formatMoney(item.balance, item.currencyCode)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Borç {formatMoney(item.debit, item.currencyCode)} · Alacak {formatMoney(item.credit, item.currencyCode)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Açıklama</TableHead>
                <TableHead>Fatura No</TableHead>
                <TableHead className="text-right">Borç</TableHead>
                <TableHead className="text-right">Alacak</TableHead>
                <TableHead>PB</TableHead>
                <TableHead className="text-right">Bakiye</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statementLines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-operation-blue ring-4 ring-brand-blue-soft" /><span>{new Date(l.date).toLocaleDateString("tr-TR")}</span></div>
                  </TableCell>
                  <TableCell>{l.description}</TableCell>
                  <TableCell>{l.invoiceNo || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.debit ? l.debit.toLocaleString("tr-TR") : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.credit ? l.credit.toLocaleString("tr-TR") : ""}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.currencyCode ?? statementCompany?.primaryCurrency ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{l.balance.toLocaleString("tr-TR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
