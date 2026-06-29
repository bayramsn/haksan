import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { MiniKpi } from "../../shared/MiniKpi";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { financeService } from "../../../../lib/services";
import { exportService } from "../../../../lib/downloadExport";
import { useAuth } from "../../../../lib/auth";
import { Wallet, Search, Download, FileText } from "lucide-react";
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
  currencies: Array<{ currencyCode: string; borc: number; alacak: number; net: number }>;
};

type StatementBalance = {
  currencyCode: string;
  debit: number;
  credit: number;
  balance: number;
};

const formatMoney = (amount: number, currencyCode?: string | null) =>
  `${Number(amount ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currencyCode ? ` ${currencyCode}` : ""}`;

const balanceTone = (amount: number) => amount >= 0 ? "text-amber-800" : "text-sky-800";

export function CustomerBalancesPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("super_admin");
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

  const totalBorc = filtered.reduce((s, r) => s + (r.borc ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="amber" icon={<Wallet className="size-[18px]" />} label="Kayıtlı Firma" value={filtered.length} sub="açık cari" />
        <MiniKpi tone="violet" icon={<Wallet className="size-[18px]" />} label="Toplam Borç (ilk PB)" value={totalBorc.toLocaleString("tr-TR")} sub="özet" />
      </div>

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
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Firma</TableHead>
                <TableHead className="text-right">Satış</TableHead>
                <TableHead className="text-right">Tahsilat</TableHead>
                <TableHead className="text-right">Borç</TableHead>
                {isAdmin && <TableHead className="text-right">Alış</TableHead>}
                {isAdmin && <TableHead className="text-right">Ödeme</TableHead>}
                {isAdmin && <TableHead className="text-right">Alacak</TableHead>}
                {isAdmin && <TableHead className="text-right">Toplam Bakiye</TableHead>}
                <TableHead>En Yakın Vade</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={isAdmin ? 10 : 6} className="text-center py-10 text-muted-foreground">Yükleniyor…</TableCell></TableRow>
              )}
              {!loading && filtered.map((r) => (
                <TableRow key={r.companyId} className="cursor-pointer hover:bg-muted/30" onClick={() => openStatement(r)}>
                  <TableCell className="font-medium">{r.companyName}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.salesTotal.toLocaleString("tr-TR")}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.collections.toLocaleString("tr-TR")}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-800">{r.borc.toLocaleString("tr-TR")}</TableCell>
                  {isAdmin && <TableCell className="text-right tabular-nums text-muted-foreground">{(r.purchases ?? 0).toLocaleString("tr-TR")}</TableCell>}
                  {isAdmin && <TableCell className="text-right tabular-nums text-muted-foreground">{(r.payouts ?? 0).toLocaleString("tr-TR")}</TableCell>}
                  {isAdmin && <TableCell className="text-right tabular-nums text-sky-800">{(r.alacak ?? 0).toLocaleString("tr-TR")}</TableCell>}
                  {isAdmin && (
                    <TableCell className={`text-right tabular-nums font-medium ${balanceTone(Number(r.totalBalance ?? r.netBorc ?? 0))}`}>
                      {formatMoney(Number(r.totalBalance ?? r.netBorc ?? 0), r.primaryCurrency)}
                    </TableCell>
                  )}
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
                <TableRow><TableCell colSpan={isAdmin ? 10 : 6} className="text-center py-10 text-muted-foreground">Kayıt yok</TableCell></TableRow>
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                  <TableCell>{new Date(l.date).toLocaleDateString("tr-TR")}</TableCell>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
