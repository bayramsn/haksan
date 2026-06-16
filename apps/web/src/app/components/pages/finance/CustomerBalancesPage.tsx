import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
  primaryCurrency: string | null;
  nearestDueDate: string | null;
  nearestDueAmount: number | null;
  nearestDueCurrency: string | null;
  currencies: Array<{ currencyCode: string; borc: number; alacak: number; net: number }>;
};

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
                <TableHead>En Yakın Vade</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={isAdmin ? 9 : 6} className="text-center py-10 text-muted-foreground">Yükleniyor…</TableCell></TableRow>
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
                <TableRow><TableCell colSpan={isAdmin ? 9 : 6} className="text-center py-10 text-muted-foreground">Kayıt yok</TableCell></TableRow>
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
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Açıklama</TableHead>
                <TableHead>Fatura No</TableHead>
                <TableHead className="text-right">Borç</TableHead>
                <TableHead className="text-right">Alacak</TableHead>
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
