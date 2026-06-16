import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../../ui/dialog";
import { Textarea } from "../../ui/textarea";
import { useStore } from "../../../lib/store";
import { financeService } from "../../../../lib/services";
import { toast } from "sonner";
import { Plus, Receipt, Trash2 } from "lucide-react";

type InstallmentRow = { installmentNo: number; dueDate: string; amount: string };
type InvoiceLineRow = {
  id: string;
  saleType: "tezgah" | "product";
  inventoryItemId?: string;
  productModelId?: string;
  categoryCode?: string;
  description?: string;
  quantity: number;
};

export type AccountingInvoicePrefill = {
  companyId: string;
  amount?: number;
  grandTotal: number;
  vatAmount?: number;
  currencyCode?: string;
  invoiceNo?: string;
  quoteId?: string;
  salesOrderId?: string;
  notes?: string;
  type?: "sales" | "purchase";
};

const defaultForm = (companyId = "") => ({
  type: "sales" as "sales" | "purchase",
  companyId,
  invoiceNo: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  amount: "",
  vatAmount: "0",
  grandTotal: "",
  currencyCode: "USD",
  firstDueDate: new Date().toISOString().slice(0, 10),
  lastDueDate: "",
  installmentCount: "1",
  notes: "",
});

export function CreateAccountingInvoiceDialog({
  trigger,
  onCreated,
  defaultCompanyId,
  prefill,
}: {
  trigger: React.ReactNode;
  onCreated?: () => void;
  defaultCompanyId?: string;
  prefill?: AccountingInvoicePrefill;
}) {
  const { customers, stock, products, refresh } = useStore();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm(defaultCompanyId));
  const [quoteId, setQuoteId] = useState<string | undefined>();
  const [salesOrderId, setSalesOrderId] = useState<string | undefined>();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [lineItems, setLineItems] = useState<InvoiceLineRow[]>([]);

  const availableTezgahStock = useMemo(
    () => stock.filter((s) => {
      if ((s.categoryCode ?? "TEZGAH") !== "TEZGAH") return false;
      if (s.status === "Available") return true;
      if (s.status === "Reserved" && s.reservedCompanyId === form.companyId) return true;
      return false;
    }),
    [stock, form.companyId],
  );

  useEffect(() => {
    if (!open) return;
    if (prefill) {
      const subtotal = prefill.amount ?? prefill.grandTotal;
      setForm({
        ...defaultForm(prefill.companyId),
        type: prefill.type ?? "sales",
        companyId: prefill.companyId,
        invoiceNo: prefill.invoiceNo ?? "",
        amount: String(subtotal),
        vatAmount: String(prefill.vatAmount ?? 0),
        grandTotal: String(prefill.grandTotal),
        currencyCode: prefill.currencyCode ?? "USD",
        notes: prefill.notes ?? "",
      });
      setQuoteId(prefill.quoteId);
      setSalesOrderId(prefill.salesOrderId);
    } else {
      setForm(defaultForm(defaultCompanyId));
      setQuoteId(undefined);
      setSalesOrderId(undefined);
      setLineItems([]);
    }
  }, [open, prefill, defaultCompanyId]);

  const previewInstallments = useMemo(() => {
    const total = Number(form.grandTotal || form.amount);
    const count = Math.max(1, Number(form.installmentCount) || 1);
    if (!Number.isFinite(total) || total <= 0) return [];
    const base = Math.floor((total / count) * 100) / 100;
    const first = new Date(form.firstDueDate);
    const last = form.lastDueDate ? new Date(form.lastDueDate) : null;
    const stepMs = last && count > 1 ? (last.getTime() - first.getTime()) / (count - 1) : 30 * 24 * 60 * 60 * 1000;
    let allocated = 0;
    const rows: InstallmentRow[] = [];
    for (let i = 0; i < count; i++) {
      const amount = i === count - 1 ? Math.round((total - allocated) * 100) / 100 : base;
      allocated += amount;
      const d = new Date(first.getTime() + stepMs * i);
      rows.push({ installmentNo: i + 1, dueDate: d.toISOString().slice(0, 10), amount: String(amount) });
    }
    return rows;
  }, [form.grandTotal, form.amount, form.installmentCount, form.firstDueDate, form.lastDueDate]);

  useEffect(() => {
    setInstallments(previewInstallments);
  }, [previewInstallments]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyId) return toast.error("Firma seçin");
    const amount = Number(form.amount);
    const grandTotal = Number(form.grandTotal || form.amount);
    if (!Number.isFinite(grandTotal) || grandTotal <= 0) return toast.error("Geçerli tutar girin");
    if (form.type === "sales" && lineItems.some((l) => l.saleType === "tezgah" && !l.inventoryItemId)) {
      return toast.error("Tezgah satışı için seri numarası seçin");
    }
    setSaving(true);
    try {
      await financeService.createAccountingInvoice({
        companyId: form.companyId,
        type: form.type,
        invoiceNo: form.invoiceNo,
        invoiceDate: form.invoiceDate,
        amount: Number.isFinite(amount) ? amount : grandTotal,
        vatAmount: Number(form.vatAmount) || 0,
        grandTotal,
        currencyCode: form.currencyCode,
        quoteId,
        salesOrderId,
        firstDueDate: form.firstDueDate,
        lastDueDate: form.lastDueDate || undefined,
        installmentCount: Number(form.installmentCount) || 1,
        notes: form.notes || undefined,
        installments: installments.map((i) => ({
          installmentNo: i.installmentNo,
          dueDate: i.dueDate,
          amount: Number(i.amount),
        })),
        lineItems: form.type === "sales" && lineItems.length
          ? lineItems.map((l) => ({
              saleType: l.saleType,
              inventoryItemId: l.inventoryItemId,
              productModelId: l.productModelId,
              categoryCode: l.saleType === "tezgah" ? "TEZGAH" : l.categoryCode,
              description: l.description,
              quantity: l.quantity,
            }))
          : undefined,
      });
      toast.success(form.type === "sales" ? "Satış faturası oluşturuldu" : "Alış faturası oluşturuldu");
      setOpen(false);
      refresh();
      onCreated?.();
    } catch (err: any) {
      toast.error("Fatura oluşturulamadı", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="size-5" /> Muhasebe Faturası</DialogTitle>
          <DialogDescription>Satış veya alış faturası ile vade planı oluşturun; cari hareketler otomatik açılır.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["sales", "purchase"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t })}
                className={`rounded-lg border px-3 py-2 text-sm ${form.type === t ? "border-primary bg-primary/10 text-primary" : "border-border/60"}`}
              >
                {t === "sales" ? "Satış Faturası" : "Alış Faturası"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Firma *</Label>
              <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Firma" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fatura No *</Label>
              <Input className="mt-1 h-9" value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Fatura Tarihi</Label>
              <Input className="mt-1 h-9" type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Para Birimi</Label>
              <Select value={form.currencyCode} onValueChange={(v) => setForm({ ...form, currencyCode: v })}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD", "EUR", "TRY"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Matrah</Label>
              <Input className="mt-1 h-9" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">KDV</Label>
              <Input className="mt-1 h-9" type="number" value={form.vatAmount} onChange={(e) => setForm({ ...form, vatAmount: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Genel Toplam *</Label>
              <Input className="mt-1 h-9" type="number" value={form.grandTotal} onChange={(e) => setForm({ ...form, grandTotal: e.target.value })} placeholder={form.amount || "0"} />
            </div>
          </div>
          {form.type === "sales" && (
            <div className="rounded-lg border border-border/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Stok Satırları</div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => setLineItems((prev) => [...prev, { id: crypto.randomUUID(), saleType: "tezgah", quantity: 1 }])}
                  >
                    <Plus className="size-3.5" /> Tezgah
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => setLineItems((prev) => [...prev, { id: crypto.randomUUID(), saleType: "product", quantity: 1, categoryCode: "YEDEK_PARCA" }])}
                  >
                    <Plus className="size-3.5" /> Ürün
                  </Button>
                </div>
              </div>
              {lineItems.length === 0 && (
                <p className="text-xs text-muted-foreground">Tezgah satışında seri no zorunludur; fatura kaydında stok düşülür ve kurulum açılır.</p>
              )}
              {lineItems.map((line, idx) => (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-end border-b border-border/40 pb-3 last:border-0 last:pb-0">
                  <div className="col-span-12 sm:col-span-3">
                    <Label className="text-xs">Satış Tipi</Label>
                    <Select
                      value={line.saleType}
                      onValueChange={(v) => setLineItems((prev) => prev.map((l, i) => i === idx ? { ...l, saleType: v as "tezgah" | "product", inventoryItemId: undefined } : l))}
                    >
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tezgah">Tezgah Satışı</SelectItem>
                        <SelectItem value="product">Ürün / Parça</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {line.saleType === "tezgah" ? (
                    <div className="col-span-12 sm:col-span-6">
                      <Label className="text-xs">Seri No *</Label>
                      <Select
                        value={line.inventoryItemId ?? ""}
                        onValueChange={(v) => {
                          const item = availableTezgahStock.find((s) => s.id === v);
                          setLineItems((prev) => prev.map((l, i) => i === idx ? {
                            ...l,
                            inventoryItemId: v,
                            description: item ? `${item.brand} ${item.counterModel} — ${item.serialNumber}` : l.description,
                          } : l));
                        }}
                      >
                        <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Stoktan seri seçin" /></SelectTrigger>
                        <SelectContent>
                          {availableTezgahStock.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.serialNumber} · {s.brand} {s.counterModel} ({s.status === "Reserved" ? "rezerve" : "hazır"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <>
                      <div className="col-span-12 sm:col-span-4">
                        <Label className="text-xs">Ürün</Label>
                        <Select
                          value={line.productModelId ?? ""}
                          onValueChange={(v) => {
                            const p = products.find((x) => x.id === v);
                            setLineItems((prev) => prev.map((l, i) => i === idx ? {
                              ...l,
                              productModelId: v,
                              categoryCode: p?.categoryCode ?? "YEDEK_PARCA",
                              description: p ? `${p.brand} ${p.model}` : l.description,
                            } : l));
                          }}
                        >
                          <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Ürün seçin" /></SelectTrigger>
                          <SelectContent>
                            {products.filter((p) => p.categoryCode !== "TEZGAH").map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.brand} {p.model}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-6 sm:col-span-2">
                        <Label className="text-xs">Adet</Label>
                        <Input
                          className="mt-1 h-9"
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => setLineItems((prev) => prev.map((l, i) => i === idx ? { ...l, quantity: Number(e.target.value) || 1 } : l))}
                        />
                      </div>
                    </>
                  )}
                  <div className="col-span-12 sm:col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div className="text-sm font-medium">Vade Planı</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">İlk Vade</Label>
                <Input className="mt-1 h-9" type="date" value={form.firstDueDate} onChange={(e) => setForm({ ...form, firstDueDate: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Son Vade</Label>
                <Input className="mt-1 h-9" type="date" value={form.lastDueDate} onChange={(e) => setForm({ ...form, lastDueDate: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Vade Sayısı</Label>
                <Input className="mt-1 h-9" type="number" min={1} value={form.installmentCount} onChange={(e) => setForm({ ...form, installmentCount: e.target.value })} />
              </div>
            </div>
            {installments.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vade</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installments.map((row) => (
                    <TableRow key={row.installmentNo}>
                      <TableCell>{row.installmentNo}</TableCell>
                      <TableCell>{row.dueDate}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(row.amount).toLocaleString("tr-TR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div>
            <Label className="text-xs">Notlar</Label>
            <Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Faturayı Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
