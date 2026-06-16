import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { financeService } from "../../../../lib/services";
import { CreateAccountingInvoiceDialog } from "./CreateAccountingInvoiceDialog";
import { Receipt, Search, Plus } from "lucide-react";

type InvoiceRow = {
  id: string;
  type: "sales" | "purchase";
  invoiceNo: string;
  invoiceDate: string;
  grandTotal: string;
  installmentCount: number;
  firstDueDate: string | null;
  lastDueDate: string | null;
  company?: { id: string; legalTitle?: string; shortName?: string | null };
  currency?: { code?: string };
};

export function AccountingInvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "sales" | "purchase">("all");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any | null>(null);

  const load = () => {
    setLoading(true);
    financeService
      .accountingInvoices({ page: 1, pageSize: 200, ...(typeFilter !== "all" ? { type: typeFilter } : {}) })
      .then((res) => setRows(res?.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [typeFilter]);

  const filtered = rows.filter((r) => {
    const name = r.company?.shortName || r.company?.legalTitle || "";
    return (
      r.invoiceNo.toLowerCase().includes(q.toLowerCase()) ||
      name.toLowerCase().includes(q.toLowerCase())
    );
  });

  const openDetail = async (id: string) => {
    try {
      const data = await financeService.accountingInvoice(id);
      setDetail(data);
    } catch {
      setDetail(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="tracking-tight flex items-center gap-2">
              <Receipt className="size-5" /> Muhasebe Faturaları
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Satış ve alış faturaları · vade planı ve cari hareketler</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Fatura no veya firma..." className="pl-9 h-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="sales">Satış</SelectItem>
                <SelectItem value="purchase">Alış</SelectItem>
              </SelectContent>
            </Select>
            <CreateAccountingInvoiceDialog
              onCreated={load}
              trigger={
                <Button size="sm" className="h-9 gap-1">
                  <Plus className="size-4" /> Yeni Fatura
                </Button>
              }
            />
            <Button size="sm" variant="outline" className="h-9" onClick={load}>Yenile</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Fatura No</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Taksit</TableHead>
                <TableHead>Vade Aralığı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Yükleniyor…</TableCell></TableRow>
              )}
              {!loading && filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openDetail(r.id)}>
                  <TableCell className="font-medium tabular-nums">{r.invoiceNo}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.type === "sales" ? "text-emerald-700 border-emerald-200" : "text-sky-700 border-sky-200"}>
                      {r.type === "sales" ? "Satış" : "Alış"}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.company?.shortName || r.company?.legalTitle || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(r.invoiceDate).toLocaleDateString("tr-TR")}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {Number(r.grandTotal).toLocaleString("tr-TR")} {r.currency?.code ?? ""}
                  </TableCell>
                  <TableCell className="text-sm">{r.installmentCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.firstDueDate ? new Date(r.firstDueDate).toLocaleDateString("tr-TR") : "—"}
                    {r.lastDueDate && r.installmentCount > 1 ? ` – ${new Date(r.lastDueDate).toLocaleDateString("tr-TR")}` : ""}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Kayıt yok</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fatura {detail?.invoiceNo}</DialogTitle>
            <DialogDescription className="sr-only">
              Fatura özeti ve taksit planı
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Tür:</span> {detail.type === "sales" ? "Satış" : "Alış"}</div>
                <div><span className="text-muted-foreground">Tarih:</span> {new Date(detail.invoiceDate).toLocaleDateString("tr-TR")}</div>
                <div><span className="text-muted-foreground">Toplam:</span> {Number(detail.grandTotal).toLocaleString("tr-TR")}</div>
                <div><span className="text-muted-foreground">Taksit:</span> {detail.installmentCount}</div>
              </div>
              {detail.installments?.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Vade</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.installments.map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.installmentNo}</TableCell>
                        <TableCell>{new Date(i.dueDate).toLocaleDateString("tr-TR")}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(i.amount).toLocaleString("tr-TR")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
