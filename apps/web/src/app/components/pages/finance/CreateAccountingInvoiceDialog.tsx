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
  vatRate?: number;
  vatAmount?: number;
  currencyCode?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  quoteId?: string;
  salesOrderId?: string;
  firstDueDate?: string;
  lastDueDate?: string | null;
  installmentCount?: number;
  installments?: InstallmentRow[];
  notes?: string;
  type?: "sales" | "purchase";
};

const defaultForm = (companyId = "") => ({
  type: "sales" as "sales" | "purchase",
  companyId,
  invoiceNo: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  amount: "",
  vatRate: "20",
  vatAmount: "0",
  grandTotal: "",
  currencyCode: "USD",
  firstDueDate: new Date().toISOString().slice(0, 10),
  lastDueDate: "",
  installmentCount: "1",
  notes: "",
});

const VAT_RATE_OPTIONS = ["20", "18", "10", "8", "1", "0"] as const;

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const parseMoneyInput = (value: string | number | undefined) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const vatAmountFromRate = (amount: string | number | undefined, vatRate: string | number | undefined) =>
  roundMoney(Math.max(parseMoneyInput(amount), 0) * (Math.max(parseMoneyInput(vatRate), 0) / 100));

const deriveVatRate = (amount: number, vatAmount?: number, grandTotal?: number, fallback = 20) => {
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const vat = Number.isFinite(vatAmount) && Number(vatAmount) > 0
    ? Number(vatAmount)
    : Math.max(0, Number(grandTotal ?? 0) - amount);
  if (!Number.isFinite(vat) || vat <= 0) return fallback;
  return roundMoney((vat / amount) * 100);
};

export function CreateAccountingInvoiceDialog({
  trigger,
  onCreated,
  onSaved,
  defaultCompanyId,
  prefill,
  invoiceId,
}: {
  trigger: React.ReactNode;
  onCreated?: () => void;
  onSaved?: () => void;
  defaultCompanyId?: string;
  prefill?: AccountingInvoicePrefill;
  invoiceId?: string;
}) {
  const { customers, stock, products, refresh } = useStore();
  const isEditing = Boolean(invoiceId);
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
      const vatRate = prefill.vatRate ?? deriveVatRate(subtotal, prefill.vatAmount, prefill.grandTotal);
      const vatAmount = prefill.vatAmount ?? vatAmountFromRate(subtotal, vatRate);
      const grandTotal = roundMoney(subtotal + vatAmount);
      setForm({
        ...defaultForm(prefill.companyId),
        type: prefill.type ?? "sales",
        companyId: prefill.companyId,
        invoiceNo: prefill.invoiceNo ?? "",
        invoiceDate: prefill.invoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        amount: String(subtotal),
        vatRate: String(vatRate),
        vatAmount: String(vatAmount),
        grandTotal: String(grandTotal),
        currencyCode: prefill.currencyCode ?? "USD",
        firstDueDate: prefill.firstDueDate?.slice(0, 10) ?? prefill.invoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        lastDueDate: prefill.lastDueDate?.slice(0, 10) ?? "",
        installmentCount: String(prefill.installmentCount ?? prefill.installments?.length ?? 1),
        notes: prefill.notes ?? "",
      });
      setQuoteId(prefill.quoteId);
      setSalesOrderId(prefill.salesOrderId);
      setInstallments(prefill.installments ?? []);
      setLineItems([]);
    } else {
      setForm(defaultForm(defaultCompanyId));
      setQuoteId(undefined);
      setSalesOrderId(undefined);
      setLineItems([]);
    }
  }, [open, prefill, defaultCompanyId]);

  const invoiceTotals = useMemo(() => {
    const amount = parseMoneyInput(form.amount);
    const vatRate = parseMoneyInput(form.vatRate);
    const typedVatAmount = parseMoneyInput(form.vatAmount);
    const net = Number.isFinite(amount) && amount > 0 ? amount : 0;
    const rate = Number.isFinite(vatRate) && vatRate >= 0 ? vatRate : 0;
    const vatAmount = roundMoney(Math.max(typedVatAmount, 0));
    return {
      amount: roundMoney(net),
      vatRate: rate,
      vatAmount,
      grandTotal: roundMoney(net + vatAmount),
    };
  }, [form.amount, form.vatAmount, form.vatRate]);

  const previewInstallments = useMemo(() => {
    const total = invoiceTotals.grandTotal;
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
  }, [invoiceTotals.grandTotal, form.installmentCount, form.firstDueDate, form.lastDueDate]);

  useEffect(() => {
    setInstallments(previewInstallments);
  }, [previewInstallments]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyId) return toast.error("Firma seçin");
    if (!Number.isFinite(invoiceTotals.amount) || invoiceTotals.amount <= 0) return toast.error("Geçerli matrah girin");
    if (form.type === "sales" && lineItems.some((l) => l.saleType === "tezgah" && !l.inventoryItemId)) {
      return toast.error("Tezgah satışı için seri numarası seçin");
    }
    setSaving(true);
    try {
      const payload = {
        companyId: form.companyId,
        type: form.type,
        invoiceNo: form.invoiceNo,
        invoiceDate: form.invoiceDate,
        amount: invoiceTotals.amount,
        vatRate: invoiceTotals.vatRate,
        vatAmount: invoiceTotals.vatAmount,
        grandTotal: invoiceTotals.grandTotal,
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
      };
      if (invoiceId) await financeService.updateAccountingInvoice(invoiceId, payload);
      else await financeService.createAccountingInvoice(payload);
      toast.success(invoiceId ? "Fatura güncellendi" : form.type === "sales" ? "Satış faturası oluşturuldu" : "Alış faturası oluşturuldu");
      setOpen(false);
      refresh();
      onSaved?.();
      onCreated?.();
    } catch (err: any) {
      toast.error(invoiceId ? "Fatura güncellenemedi" : "Fatura oluşturulamadı", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="size-5" /> {isEditing ? "Faturayı Düzenle" : "Muhasebe Faturası"}</DialogTitle>
          <DialogDescription>{isEditing ? "Fatura bilgileri ve vade planını güncelleyin." : "Satış veya alış faturası ile vade planı oluşturun; cari hareketler otomatik açılır."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["sales", "purchase"] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={isEditing}
                onClick={() => setForm({ ...form, type: t })}
                className={`rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 ${form.type === t ? "border-primary bg-primary/10 text-primary" : "border-border/60"}`}
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
              <Input
                className="mt-1 h-9"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => {
                  const amount = e.target.value;
                  setForm({ ...form, amount, vatAmount: String(vatAmountFromRate(amount, form.vatRate)) });
                }}
              />
            </div>
            <div>
              <Label className="text-xs">KDV Oranı</Label>
              <Select
                value={form.vatRate}
                onValueChange={(vatRate) => setForm({ ...form, vatRate, vatAmount: String(vatAmountFromRate(form.amount, vatRate)) })}
              >
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {!VAT_RATE_OPTIONS.includes(form.vatRate as typeof VAT_RATE_OPTIONS[number]) && form.vatRate ? (
                    <SelectItem value={form.vatRate}>%{form.vatRate}</SelectItem>
                  ) : null}
                  {VAT_RATE_OPTIONS.map((rate) => <SelectItem key={rate} value={rate}>%{rate}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">KDV Tutarı</Label>
              <Input
                className="mt-1 h-9"
                type="number"
                min="0"
                step="0.01"
                value={form.vatAmount}
                onChange={(e) => setForm({ ...form, vatAmount: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Genel Toplam *</Label>
              <Input className="mt-1 h-9 bg-muted/40 font-medium" readOnly value={invoiceTotals.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
            </div>
          </div>
          {form.type === "sales" && !isEditing && (
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
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : isEditing ? "Güncelle" : "Faturayı Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
